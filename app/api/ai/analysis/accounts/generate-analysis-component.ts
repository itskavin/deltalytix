import { tool } from "ai";
import { generateObject } from "ai";
import { z } from 'zod/v3';
import { AccountAnalysisSchema, type AccountAnalysis } from './get-account-performance';
import { getPreferredModelForCurrentUser } from '@/lib/ai/user-model';

// Define the simplified schema for the structured analysis output (4 parts only)
const AnalysisOutputSchema = z.object({
  summary: z.string().describe('Brief overview of the overall portfolio performance'),
  strengths: z.array(z.string()).describe('Top 3-5 things that are working well'),
  improvements: z.array(z.string()).describe('Top 3-5 areas that need attention'),
  recommendations: z.array(z.string()).describe('Top 3-5 actionable recommendations')
});

type RiskLevel = 'low' | 'medium' | 'high' | string;

function calculatePortfolioRisk(accounts: Array<{ riskLevel: RiskLevel }> | undefined): string {
  const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
  if (!accounts?.length) return 'unknown';
  let max = -1;
  for (const a of accounts) {
    const v = order[String(a.riskLevel ?? '').toLowerCase()] ?? -1;
    if (v > max) max = v;
  }
  if (max === 2) return 'high';
  if (max === 1) return 'medium';
  if (max === 0) return 'low';
  return 'unknown';
}

function getBestWorstAccountNumbers(accounts: Array<{ accountNumber: string; netPnL: number }> | undefined): {
  bestAccount: string;
  worstAccount: string;
} {
  if (!accounts?.length) return { bestAccount: 'N/A', worstAccount: 'N/A' };
  let best = accounts[0];
  let worst = accounts[0];
  for (const a of accounts) {
    if (a.netPnL > best.netPnL) best = a;
    if (a.netPnL < worst.netPnL) worst = a;
  }
  return { bestAccount: best.accountNumber, worstAccount: worst.accountNumber };
}

function buildFallbackStructuredAnalysis(args: {
  locale: string;
  username?: string;
  accountData: AccountAnalysis;
}): z.infer<typeof AnalysisOutputSchema> {
  const { locale, accountData } = args;
  const totalAccounts = accountData?.accounts?.length ?? 0;
  const totalPortfolioValue = accountData?.totalPortfolioValue ?? 0;
  const totalTrades = accountData?.accounts?.reduce((sum, a) => sum + (a.totalTrades ?? 0), 0) ?? 0;

  const risk = calculatePortfolioRisk(accountData?.accounts);
  const { bestAccount, worstAccount } = getBestWorstAccountNumbers(
    (accountData?.accounts ?? []).map((a) => ({ accountNumber: a.accountNumber, netPnL: a.netPnL })),
  );

  // Keep this intentionally simple and always non-empty.
  const summaryEn =
    totalAccounts === 0
      ? 'No account data was available to analyze. Please sync or import trades and try again.'
      : `Portfolio net PnL is $${totalPortfolioValue.toLocaleString()} across ${totalAccounts} account(s) (${totalTrades} trade(s)). Current portfolio risk is classified as ${risk}. Best account: ${bestAccount}.`;

  const summaryFr =
    totalAccounts === 0
      ? "Aucune donnée de compte n'était disponible pour l'analyse. Veuillez synchroniser ou importer des trades puis réessayer."
      : `Le PnL net du portefeuille est de $${totalPortfolioValue.toLocaleString()} sur ${totalAccounts} compte(s) (${totalTrades} trade(s)). Le risque est classé ${risk}. Meilleur compte : ${bestAccount}.`;

  const summary = locale === 'fr' ? summaryFr : summaryEn;

  const strengths = totalTrades <= 1
    ? [
        'Positive initial result, but the sample size is too small for statistical confidence.',
        'Costs (commissions) are tracked, enabling net performance evaluation.',
        'Account-level metrics are available for comparison as more trades accrue.',
      ]
    : [
        'Portfolio has a positive net PnL overall.',
        'Clear instrument and account-level breakdown is available.',
        'Win/loss distribution can be reviewed per account.',
      ];

  const improvements = totalTrades <= 1
    ? [
        'Increase the trade sample size to make metrics like Profit Factor and Sharpe meaningful.',
        'Track drawdowns over time; a 0% drawdown with 1 trade is not representative.',
        'Validate risk sizing rules per trade (stop distance, max loss, daily loss limit).',
      ]
    : [
        'Reduce drawdown variability and improve consistency across accounts.',
        'Confirm that profit factor stays > 1.0 after costs.',
        'Review risk concentration in the highest-risk accounts.',
      ];

  const recommendations = totalTrades <= 1
    ? [
        'Log 30–50 additional trades before relying on advanced statistics.',
        'Set a max loss per trade and max daily loss rule, then audit adherence weekly.',
        'Separate analysis by instrument/session once you have enough volume.',
      ]
    : [
        'Create a playbook for your top setups and measure expectancy per setup.',
        'Cap per-account risk and rebalance capital toward the most consistent account.',
        'Run a weekly review: biggest loss, rule violations, and commission impact.',
      ];

  return { summary, strengths, improvements, recommendations };
}

export const generateAnalysisComponent = tool({
  description: 'Generate AI-powered text analysis of account performance data. This provides detailed insights and recommendations based on the account data.',
  inputSchema: z.object({
    locale: z.string().default('en').describe('Language for the analysis content'),
    username: z.string().optional().describe('Username for personalized analysis'),
    accountData: AccountAnalysisSchema.describe('Account performance data from getAccountPerformance tool')
  }),
  execute: async ({ 
    locale = 'en', 
    username,
    accountData
  }: {
    locale?: string;
    username?: string;
    accountData: AccountAnalysis;
  }) => {
    console.log(`[generateAnalysisComponent] Generating structured AI analysis for accounts analysis for ${username} in ${locale}`);
    
    // Generate timestamp
    const now = new Date().toISOString();

    const dataSummary = {
      totalAccounts: accountData?.accounts?.length || 0,
      totalPortfolioValue: accountData?.totalPortfolioValue || 0,
      portfolioRisk: calculatePortfolioRisk(accountData?.accounts),
      ...getBestWorstAccountNumbers(
        (accountData?.accounts ?? []).map((a) => ({ accountNumber: a.accountNumber, netPnL: a.netPnL })),
      ),
    };
    
    // Create a comprehensive prompt for AI analysis
    const analysisPrompt = `# Trading Account Performance Analysis

You are an expert trading analyst. Analyze the following account performance data and provide detailed insights, recommendations, and analysis.

## Account Data Summary:
- Total Portfolio Value: $${accountData?.totalPortfolioValue?.toLocaleString() || 0}
- Number of Accounts: ${accountData?.accounts?.length || 0}

## Individual Account Performance:
${accountData?.accounts?.map(acc => `
Account ${acc.accountNumber}:
- Net PnL: $${acc.netPnL.toLocaleString()}
- Win Rate: ${acc.winRate.toFixed(1)}%
- Total Trades: ${acc.totalTrades}
- Profit Factor: ${acc.profitFactor.toFixed(2)}
- Risk Level: ${acc.riskLevel}
- Max Drawdown: ${acc.maxDrawdown.toFixed(2)}%
- Sharpe Ratio: ${acc.sharpeRatio.toFixed(2)}
- Most Traded Instrument: ${acc.mostTradedInstrument}
- Profitability: ${acc.profitability}
`).join('\n') || 'No account data available'}

## Analysis Requirements:
${locale === 'fr' ? `
Analysez ces données de performance de trading et fournissez une analyse simple avec 4 parties:

1. **Résumé**: Vue d'ensemble de la performance du portefeuille (2-3 phrases)
2. **Points Forts**: Top 3-5 choses qui fonctionnent bien (liste courte)
3. **Améliorations**: Top 3-5 domaines à améliorer (liste courte)
4. **Recommandations**: Top 3-5 actions concrètes à prendre (liste courte)

Soyez concis et actionnable. Maximum 3-5 points par section.
` : `
Analyze this trading account performance data and provide a simple 4-part analysis:

1. **Summary**: Overview of portfolio performance (2-3 sentences)
2. **Strengths**: Top 3-5 things that are working well (short list)
3. **Improvements**: Top 3-5 areas that need attention (short list)
4. **Recommendations**: Top 3-5 concrete actions to take (short list)

Be concise and actionable. Maximum 3-5 points per section.
`}

Please provide a comprehensive structured analysis that would be valuable for a trader looking to improve their performance.`;

    try {
      const model = await getPreferredModelForCurrentUser({
        purpose: 'analysis',
        fallbackOpenAiModelId: 'gpt-4o-mini',
      });

      // Generate structured AI analysis using generateObject
      const { object } = await generateObject({
        model,
        prompt: analysisPrompt,
        schema: AnalysisOutputSchema,
      });

      // Return the simplified structured AI analysis
      return {
        locale,
        username,
        generatedAt: now,
        structuredAnalysis: object,
        dataSummary,
      };
    } catch (error) {
      console.error('Error generating structured AI analysis:', error);
      const fallback = buildFallbackStructuredAnalysis({ locale, username, accountData });
      return {
        locale,
        username,
        generatedAt: now,
        structuredAnalysis: fallback,
        dataSummary,
        error: true,
      };
    }
  }
});
