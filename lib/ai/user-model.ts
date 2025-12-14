import 'server-only'

import type { LanguageModel } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/ai/secrets'
import { getUserId } from '@/server/auth'

type AiSettingsRow = {
  preferredProvider: AiProvider
  geminiApiKeyEncrypted: string | null
  geminiModel: string | null
  ollamaHostUrl: string | null
  ollamaModel: string | null
}

export type AiProvider = 'openai' | 'gemini' | 'ollama'

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export async function getPreferredModelForCurrentUser(options: {
  purpose: 'chat' | 'analysis'
  fallbackOpenAiModelId: string
  requireTools?: boolean
}): Promise<LanguageModel> {
  const fallback = openai(options.fallbackOpenAiModelId)

  try {
    const authUserId = await getUserId()
    const rows = await prisma.$queryRaw<AiSettingsRow[]>`
      SELECT
        "preferredProvider",
        "geminiApiKeyEncrypted",
        "geminiModel",
        "ollamaHostUrl",
        "ollamaModel"
      FROM "public"."AiSettings"
      WHERE "authUserId" = ${authUserId}
      LIMIT 1
    `
    const settings = rows[0]

    if (!settings) return fallback

    const provider = settings.preferredProvider ?? 'openai'

    if (provider === 'gemini') {
      if (!settings.geminiApiKeyEncrypted) return fallback
      const apiKey = decryptSecret(settings.geminiApiKeyEncrypted)
      const google = createGoogleGenerativeAI({ apiKey })
      const modelId = settings.geminiModel || 'gemini-flash-latest'
      return google(modelId)
    }

    if (provider === 'ollama') {
      const host = settings.ollamaHostUrl ? normalizeBaseUrl(settings.ollamaHostUrl) : ''
      const modelId = settings.ollamaModel?.trim() ?? ''
      if (!host || !modelId) return fallback

      // Some Ollama models do not support tool/function calling (e.g. deepseek-r1).
      // If tools are required (chat route), fall back to OpenAI to keep tool UX working.
      if (options.requireTools && /deepseek-r1/i.test(modelId)) {
        return fallback
      }

      // Ollama exposes an OpenAI-compatible API at {host}/v1
      const ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL: `${host}/v1`,
        apiKey: 'ollama',
      })

      return ollama(modelId)
    }

    return fallback
  } catch {
    // If auth fails or anything unexpected happens, preserve current OpenAI behavior.
    return fallback
  }
}
