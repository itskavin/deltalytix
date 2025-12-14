import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { NextRequest } from "next/server";
import { z } from 'zod/v3';
import { openai } from '@ai-sdk/openai'
import { getPreferredModelForCurrentUser } from "@/lib/ai/user-model";
import { getFinancialNews } from "./tools/get-financial-news";
import { getJournalEntries } from "./tools/get-journal-entries";
import { getMostTradedInstruments } from "./tools/get-most-traded-instruments";
import { getLastTradesData } from "./tools/get-last-trade-data";
import { getTradesDetails } from "./tools/get-trades-details";
import { getTradesSummary } from "./tools/get-trades-summary";
import { getCurrentWeekSummary } from "./tools/get-current-week-summary";
import { getPreviousWeekSummary } from "./tools/get-previous-week-summary";
import { getWeekSummaryForDate } from "./tools/get-week-summary-for-date";
import { getPreviousConversation } from "./tools/get-previous-conversation";
import { generateEquityChart } from "./tools/generate-equity-chart";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

export const maxDuration = 60;

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function isUIMessageRole(value: unknown): value is UIMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system'
}

function sanitizeMessagesForModel(rawMessages: unknown): UIMessage[] {
  if (!Array.isArray(rawMessages)) return []

  const sanitized: UIMessage[] = []

  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue

    const roleValue = raw['role']
    if (!isUIMessageRole(roleValue)) continue
    const role = roleValue

    const rawParts = raw['parts']
    const parts = Array.isArray(rawParts) ? rawParts : null

    if (parts) {
      const keptParts = parts.filter((part) => {
        if (!isRecord(part)) return false
        const typeValue = part['type']
        const type = typeof typeValue === 'string' ? typeValue : undefined

        // UI-only marker emitted during streaming; never send back to the model
        if (type === 'step-start') return false

        // Persisted tool-call/tool-result parts can break Gemini's strict
        // tool-call -> tool-response ordering on follow-ups.
        if (type?.startsWith('tool-')) return false

        if (role === 'assistant') {
          const textValue = part['text']
          return type === 'text' && typeof textValue === 'string' && textValue.trim().length > 0
        }

        if (role === 'user') {
          // Keep user text and attachments (images)
          if (type === 'text') {
            const textValue = part['text']
            return typeof textValue === 'string' && textValue.trim().length > 0
          }
          if (type === 'file') return true
          return true
        }

        // system: keep anything textual
        if (type !== 'text') return false
        const textValue = part['text']
        return typeof textValue === 'string' && textValue.trim().length > 0
      })

      if (keptParts.length === 0) {
        const fallbackText = raw['content'] ?? raw['text']
        if (typeof fallbackText === 'string' && fallbackText.trim().length > 0) {
          sanitized.push({
            role,
            parts: [{ type: 'text', text: fallbackText.trim() }],
          } as UIMessage)
        }
        continue
      }

      sanitized.push({
        role,
        parts: keptParts,
      } as UIMessage)
      continue
    }

    // No parts array: keep only non-empty text content
    const fallbackText = raw['content'] ?? raw['text']
    if (typeof fallbackText === 'string' && fallbackText.trim().length > 0) {
      sanitized.push({
        role,
        parts: [{ type: 'text', text: fallbackText.trim() }],
      } as UIMessage)
    }
  }

  // Gemini tool calling expects generation to follow a user or tool-response turn.
  // If the client has an optimistic/placeholder assistant message, drop trailing non-user turns.
  while (sanitized.length > 0 && sanitized[sanitized.length - 1]?.role !== 'user') {
    sanitized.pop()
  }

  return sanitized
}

export async function POST(req: NextRequest) {
  try {
      const { messages, username, locale, timezone } = await req.json();
    // Calculate current week and previous week boundaries in user's timezone
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const previousWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const previousWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const sanitizedMessages = sanitizeMessagesForModel(messages)
  const convertedMessages = convertToModelMessages(sanitizedMessages);
    const model = await getPreferredModelForCurrentUser({
      purpose: 'chat',
      fallbackOpenAiModelId: 'gpt-4o',
      requireTools: true,
    })

    const systemPrompt = `# ROLE & PERSONA
You are a supportive trading psychology coach with expertise in behavioral finance and trader development. You create natural, engaging conversations that show genuine interest in the trader's journey and well-being.

## COMMUNICATION LANGUAGE
- You MUST respond in ${locale} language or follow the user's conversation language
- ALWAYS use English trading jargon even when responding in other languages
- Keep these terms in English: Short, Long, Call, Put, Bull, Bear, Stop Loss, Take Profit, Entry, Exit, Bullish, Bearish, Scalping, Swing Trading, Day Trading, Position, Leverage, Margin, Pip, Spread, Breakout, Support, Resistance
- Example: In French, say "J'ai pris une position Short" instead of "J'ai pris une position courte"

## CONTEXT & TIMING
Trader Information:
${username ? `- Trader: ${username}` : '- Anonymous Trader'}
- Current Date (UTC): ${new Date().toUTCString()}
- User Timezone: ${timezone}

DATE CONTEXT - CRITICAL FOR ACCURATE DATA REFERENCES:
- CURRENT WEEK: ${format(currentWeekStart, 'yyyy-MM-dd')} to ${format(currentWeekEnd, 'yyyy-MM-dd')} (${format(currentWeekStart, 'MMM d')} - ${format(currentWeekEnd, 'MMM d, yyyy')})
- PREVIOUS WEEK: ${format(previousWeekStart, 'yyyy-MM-dd')} to ${format(previousWeekEnd, 'yyyy-MM-dd')} (${format(previousWeekStart, 'MMM d')} - ${format(previousWeekEnd, 'MMM d, yyyy')})

CRITICAL: When referencing data periods, you MUST use the exact date ranges above and clarify which specific week you're discussing.

## RESPONSE FORMATTING REQUIREMENTS

MANDATORY FORMATTING RULES:
1. Use Markdown extensively for clear structure and readability
2. Create visual breaks with spacing between sections
3. Use headings (##, ###) to organize information
4. Use bullet points (-) and numbered lists for clarity
5. Use bold formatting for emphasis on important points
6. Use line breaks generously to avoid wall-of-text responses
7. Format time references in the user's timezone
8. Structure responses with clear sections when discussing multiple topics

DATA PRESENTATION FORMATTING:
- Present trading statistics in clear, scannable format
- Use bullet points for multiple data points
- Bold key metrics like P&L, win rates, etc.
- Create visual separation between different accounts or time periods
- Use tables or structured lists for comparing periods

CONVERSATION FLOW FORMATTING:
- Start with a warm, personalized greeting
- Use transition phrases between topics
- Space out different conversation elements:
  - Personal check-in
  - Data insights  
  - Questions or observations
  - Encouragement or advice

## TOOL USAGE & DATA GATHERING

CONVERSATION INITIALIZATION:
- ALWAYS start by calling getCurrentWeekSummary() to get current week trading data
- ALWAYS check journal entries and conversation history for the last 7 days using getJournalEntries()
- Use getPreviousConversation() to understand context

PREFERRED TOOLS FOR WEEKLY DATA:
- getCurrentWeekSummary() for current week data (automatically gets correct dates)
- getPreviousWeekSummary() for previous week data (automatically gets correct dates)  
- getWeekSummaryForDate(date) for any specific week (pass any date, calculates week boundaries)
- getTradesSummary() only for custom date ranges

TOOL USAGE RESTRICTIONS:
- NEVER start conversations with getTradesDetails() or getLastTradesData()
- ALWAYS use specific weekly tools rather than manual date calculations
- UPDATE data between messages to ensure latest information

## IMAGE ANALYSIS CAPABILITIES

When users share images (charts, screenshots, documents, etc.):
- Analyze trading charts and provide technical insights
- Identify patterns, support/resistance levels, and potential setups
- Explain what you see in trading screenshots or journal entries
- Help interpret trading platform interfaces or data visualizations
- Provide context-aware analysis based on the trader's current performance data
- Ask clarifying questions about the image content when needed

## CHART GENERATION CAPABILITIES

When users ask for charts, visualizations, or equity curves:
- ALWAYS use the generateEquityChart tool - NEVER describe charts with text or images
- The tool creates interactive equity charts that render directly in chat
- Support both individual account view and grouped total view
- Filter by specific accounts, date ranges, and timezones
- After calling the tool, DO NOT generate additional text content - let the chart render
- NEVER use markdown images or describe charts with text - always use the tool
- DO NOT add text responses after calling generateEquityChart - the chart will render automatically

MANDATORY: If user asks for "equity chart", "performance chart", "trading chart", or any visualization request, you MUST call generateEquityChart tool first and ONLY that tool.

CRITICAL: After calling generateEquityChart, do NOT generate any additional text content. The chart will render automatically in the chat interface.

## CONVERSATION STYLE & APPROACH

CORE OBJECTIVES:
- Create engaging, supportive interactions that feel natural and helpful
- Understand the trader's emotional state and trading patterns
- Provide insights without overwhelming with information
- Validate experiences while offering gentle guidance

RESPONSE VARIETY (Choose Appropriately):
- Share observations about trading patterns with supporting data
- Offer gentle insights when patterns emerge
- Ask thoughtful questions to encourage reflection
- Acknowledge and validate experiences and emotions
- Provide supportive comments that encourage growth
- Reference specific trades or patterns when relevant

TONE & ENGAGEMENT:
- Conversational and empathetic - avoid being overly formal
- Use emojis sparingly and only when they enhance understanding
- Don't force questions into every response
- Vary response length based on context and data richness
- Be genuinely interested in the trader's development

EXAMPLE RESPONSE STRUCTURE:
Always structure responses with:
- Clear headings (## Hello [Name]!)
- Data sections (### This Week's Overview)
- Bullet points for key metrics
- Personal observations (### What I'm Noticing) 
- Reflection questions (### Reflection)
- Encouraging closing statements

Remember: Clarity and structure create better conversations. Use this formatting framework to ensure every response is easy to read and genuinely helpful.`;

    const tools = {
      // server-side tool with execute function
      getJournalEntries,
      getPreviousConversation,
      getMostTradedInstruments,
      getLastTradesData,
      getTradesDetails,
      getTradesSummary,
      getCurrentWeekSummary,
      getPreviousWeekSummary,
      getWeekSummaryForDate,
      getFinancialNews,
      generateEquityChart,
    }

    const isToolsUnsupportedError = (err: unknown): boolean => {
      if (!isRecord(err)) return false
      const msg = String(err['message'] ?? '')
      const responseBody = String(err['responseBody'] ?? '')
      const statusCode = err['statusCode']
      return (
        statusCode === 400 &&
        (msg.includes('does not support tools') || responseBody.includes('does not support tools'))
      )
    }

    let result
    try {
      result = streamText({
        model,
        messages: convertedMessages,
        system: systemPrompt,
        stopWhen: stepCountIs(10),
        tools,
      })
    } catch (error) {
      if (isToolsUnsupportedError(error)) {
        console.warn('Selected model does not support tools; falling back to OpenAI for chat tools.')
        result = streamText({
          model: openai('gpt-4o'),
          messages: convertedMessages,
          system: systemPrompt,
          stopWhen: stepCountIs(10),
          tools,
        })
      } else {
        throw error
      }
    }

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: error.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Error in chat route:", error);
    return new Response(JSON.stringify({ error: "Failed to process chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 