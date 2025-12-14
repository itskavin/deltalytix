'use server'

import { prisma } from '@/lib/prisma'
import { getUserId } from '@/server/auth'
import { encryptSecret } from '@/lib/ai/secrets'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import crypto from 'node:crypto'

type AiSettingsRow = {
  preferredProvider: 'openai' | 'gemini' | 'ollama'
  geminiModel: string
  geminiApiKeyEncrypted: string | null
  ollamaHostUrl: string | null
  ollamaModel: string | null
}

const aiProviderSchema = z.enum(['openai', 'gemini', 'ollama'])

const upsertSchema = z.object({
  preferredProvider: aiProviderSchema,
  geminiApiKey: z.string().optional(),
  geminiModel: z.enum(['gemini-flash-latest', 'gemini-2.5-pro', 'gemini-3.0-pro']).optional(),
  ollamaHostUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
})

function normalizeHostUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export async function getAiSettingsAction(): Promise<{
  preferredProvider: 'openai' | 'gemini' | 'ollama'
  geminiModel: string
  hasGeminiApiKey: boolean
  ollamaHostUrl: string
  ollamaModel: string
}> {
  try {
    const authUserId = await getUserId()
    const rows = await prisma.$queryRaw<AiSettingsRow[]>`
      SELECT
        "preferredProvider",
        "geminiModel",
        "geminiApiKeyEncrypted",
        "ollamaHostUrl",
        "ollamaModel"
      FROM "public"."AiSettings"
      WHERE "authUserId" = ${authUserId}
      LIMIT 1
    `
    const settings = rows[0]

    const parsedProvider = aiProviderSchema.safeParse(settings?.preferredProvider)

    return {
      preferredProvider: parsedProvider.success ? parsedProvider.data : 'gemini',
      geminiModel: settings?.geminiModel ?? 'gemini-flash-latest',
      hasGeminiApiKey: Boolean(settings?.geminiApiKeyEncrypted),
      ollamaHostUrl: settings?.ollamaHostUrl ?? '',
      ollamaModel: settings?.ollamaModel ?? '',
    }
  } catch (error) {
    // If the migration hasn't been applied yet (table missing), fall back to defaults.
    console.error('Error loading AI settings:', error)
    return {
      preferredProvider: 'gemini',
      geminiModel: 'gemini-flash-latest',
      hasGeminiApiKey: false,
      ollamaHostUrl: '',
      ollamaModel: '',
    }
  }
}

export async function upsertAiSettingsAction(input: z.input<typeof upsertSchema>) {
  const authUserId = await getUserId()
  const data = upsertSchema.parse(input)

  const ollamaHostUrl = data.ollamaHostUrl ? normalizeHostUrl(data.ollamaHostUrl) : undefined
  const geminiModel = data.geminiModel ?? 'gemini-flash-latest'

  const geminiApiKeyEncrypted =
    data.geminiApiKey === undefined
      ? undefined
      : data.geminiApiKey.trim()
        ? encryptSecret(data.geminiApiKey.trim())
        : null

  const now = new Date()
  const id = crypto.randomUUID()

  let current: AiSettingsRow | undefined
  try {
    // We update only the fields provided; others remain as-is.
    const existing = await prisma.$queryRaw<AiSettingsRow[]>`
      SELECT
        "preferredProvider",
        "geminiModel",
        "geminiApiKeyEncrypted",
        "ollamaHostUrl",
        "ollamaModel"
      FROM "public"."AiSettings"
      WHERE "authUserId" = ${authUserId}
      LIMIT 1
    `
    current = existing[0]
  } catch (error) {
    console.error('Error reading existing AI settings:', error)
    // If the table doesn't exist yet, we still want to try inserting below.
    current = undefined
  }

  const nextGeminiApiKeyEncrypted =
    geminiApiKeyEncrypted === undefined ? current?.geminiApiKeyEncrypted ?? null : geminiApiKeyEncrypted
  const nextOllamaHostUrl =
    ollamaHostUrl === undefined ? current?.ollamaHostUrl ?? null : (ollamaHostUrl || null)
  const nextOllamaModel =
    data.ollamaModel === undefined ? current?.ollamaModel ?? null : (data.ollamaModel?.trim() || null)

  try {
    await prisma.$executeRaw`
      INSERT INTO "public"."AiSettings" (
        "id",
        "authUserId",
        "preferredProvider",
        "geminiApiKeyEncrypted",
        "geminiModel",
        "ollamaHostUrl",
        "ollamaModel",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${authUserId},
        ${data.preferredProvider}::"AiProvider",
        ${nextGeminiApiKeyEncrypted},
        ${geminiModel},
        ${nextOllamaHostUrl},
        ${nextOllamaModel},
        ${now},
        ${now}
      )
      ON CONFLICT ("authUserId") DO UPDATE SET
        "preferredProvider" = EXCLUDED."preferredProvider"::text::"AiProvider",
        "geminiApiKeyEncrypted" = EXCLUDED."geminiApiKeyEncrypted",
        "geminiModel" = EXCLUDED."geminiModel",
        "ollamaHostUrl" = EXCLUDED."ollamaHostUrl",
        "ollamaModel" = EXCLUDED."ollamaModel",
        "updatedAt" = EXCLUDED."updatedAt"
    `
    
    revalidatePath('/dashboard/ai-settings')
    return { success: true }
  } catch (error) {
    console.error('Error saving AI settings:', error)
    throw new Error('Failed to save AI settings. Ensure the AiSettings migration has been applied.')
  }
}

export async function getOllamaModelsAction(ollamaHostUrl: string): Promise<{ models: string[] }> {
  try {
    const authUserId = await getUserId()
    void authUserId

    const base = normalizeHostUrl(ollamaHostUrl)
    if (!base) return { models: [] }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)

    try {
      const res = await fetch(`${base}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })

      if (!res.ok) {
        return { models: [] }
      }

      const json = (await res.json()) as { models?: Array<{ name?: string }> }
      const models = (json.models ?? [])
        .map(m => (m.name ?? '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))

      return { models }
    } catch (error) {
      console.error('Error fetching Ollama models:', error)
      return { models: [] }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.error('Error in getOllamaModelsAction:', error)
    return { models: [] }
  }
}
