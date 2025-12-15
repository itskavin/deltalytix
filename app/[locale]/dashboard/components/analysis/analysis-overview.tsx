'use client'

import { useCallback, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/client"
import {
  Clock,
  Trash2
} from "lucide-react"
import { AccountsAnalysis } from "./accounts-analysis"
import { useAnalysisStore } from "@/store/analysis-store"

export function AnalysisOverview() {
  const t = useI18n()

  const clearAnalysis = useAnalysisStore((s) => s.clearAnalysis)
  const storeHasData = useAnalysisStore(
    (s) => !!(s.accountPerformanceData?.accounts?.length || s.analysisResult),
  )
  const storeLastUpdated = useAnalysisStore((s) => s.lastUpdated)

  const [resetKey, setResetKey] = useState(0)
  const [childStatus, setChildStatus] = useState<{
    isLoading: boolean
    hasData: boolean
    lastUpdated: Date | null
  }>({ isLoading: false, hasData: storeHasData, lastUpdated: storeLastUpdated })

  const hasData = childStatus.hasData || storeHasData
  const lastUpdated = childStatus.lastUpdated ?? storeLastUpdated

  const statusLabel = useMemo(() => {
    if (!lastUpdated) return t("analysis.notAnalyzed")
    return t("analysis.lastUpdated", { date: lastUpdated.toLocaleDateString() })
  }, [lastUpdated, t])

  const handleClear = useCallback(() => {
    clearAnalysis()
    setResetKey((k) => k + 1)
    setChildStatus({ isLoading: false, hasData: false, lastUpdated: null })
  }, [clearAnalysis])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-primary">{t('analysis.title')}</h2>
          <p className="text-base text-muted-foreground">{t('analysis.description')}</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleClear}
            variant="ghost"
            size="default"
            title={t('analysis.clearCache')}
            disabled={!hasData || childStatus.isLoading}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
          <Badge variant="secondary" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {statusLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-1">
        <AccountsAnalysis
          key={resetKey}
          onStatusChange={(status) => {
            setChildStatus(status)
          }}
        />
      </div>
    </div>
  )
} 