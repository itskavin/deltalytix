'use server'

import { prisma } from '@/lib/prisma'
import { getUserId } from '@/server/auth'
import type { UIMessage } from 'ai'

function coerceMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return []
  return value.filter((m) => m && typeof m === 'object') as UIMessage[]
}

export async function getChatHistoryAction(): Promise<UIMessage[]> {
  try {
    const authUserId = await getUserId()

    const row = await prisma.chatHistory.findUnique({
      where: { userId: authUserId },
      select: { messages: true },
    })

    return coerceMessages(row?.messages)
  } catch (error) {
    console.error('Error loading chat history:', error)
    // Return empty array instead of throwing to prevent UI crashes
    return []
  }
}

export async function saveChatHistoryAction(messages: UIMessage[]): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const authUserId = await getUserId()

    const normalized = coerceMessages(messages)

    await prisma.chatHistory.upsert({
      where: { userId: authUserId },
      create: {
        userId: authUserId,
        messages: normalized as unknown as any,
      },
      update: {
        messages: normalized as unknown as any,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Error saving chat history:', error)
    return { success: false, error: 'Failed to save chat history' }
  }
}

export async function resetChatHistoryAction(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const authUserId = await getUserId()

    await prisma.chatHistory.deleteMany({
      where: { userId: authUserId },
    })

    return { success: true }
  } catch (error) {
    console.error('Error resetting chat history:', error)
    return { success: false, error: 'Failed to reset chat history' }
  }
}
