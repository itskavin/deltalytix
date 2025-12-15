'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useI18n } from '@/locales/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

import { getAiSettingsAction, getOllamaModelsAction, upsertAiSettingsAction } from '@/server/ai-settings'

type Provider = 'gemini' | 'ollama' | 'openai'

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-pro', 'gemini-3.0-pro'] as const

const DEFAULT_OLLAMA_HOST_URL = 'http://localhost:11434'

type GeminiModel = (typeof GEMINI_MODELS)[number]

export default function AiSettingsPage() {
  const t = useI18n()
  const [isPending, startTransition] = useTransition()

  const [preferredProvider, setPreferredProvider] = useState<Provider>('gemini')
  const [geminiModel, setGeminiModel] = useState<GeminiModel>('gemini-flash-latest')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState(false)

  const [ollamaHostUrl, setOllamaHostUrl] = useState(DEFAULT_OLLAMA_HOST_URL)
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false)

  const canSave = useMemo(() => {
    if (preferredProvider === 'gemini') {
      return Boolean(geminiApiKey.trim()) || hasGeminiApiKey
    }
    if (preferredProvider === 'ollama') {
      return Boolean(ollamaHostUrl.trim()) && Boolean(ollamaModel.trim())
    }
    return true
  }, [preferredProvider, geminiApiKey, hasGeminiApiKey, ollamaHostUrl, ollamaModel])

  useEffect(() => {
    startTransition(async () => {
      try {
        const settings = await getAiSettingsAction()
        setPreferredProvider(settings.preferredProvider)
        setGeminiModel((settings.geminiModel as GeminiModel) || 'gemini-flash-latest')
        setHasGeminiApiKey(settings.hasGeminiApiKey)
        setOllamaHostUrl(settings.ollamaHostUrl || DEFAULT_OLLAMA_HOST_URL)
        setOllamaModel(settings.ollamaModel)
      } catch (e) {
        console.error(e)
        toast.error(t('aiSettings.loadError'))
      }
    })
  }, [startTransition, t])

  async function loadOllamaModels() {
    if (!ollamaHostUrl.trim()) {
      setOllamaModels([])
      return
    }

    setIsLoadingOllamaModels(true)
    try {
      const { models } = await getOllamaModelsAction(ollamaHostUrl)
      setOllamaModels(models)
      if (models.length === 0) {
        toast.error(t('aiSettings.ollamaModelsEmpty'))
      } else {
        toast.success(t('aiSettings.ollamaModelsLoaded', { count: models.length }))
      }
    } catch (e) {
      console.error(e)
      toast.error(t('aiSettings.ollamaModelsLoadError'))
    } finally {
      setIsLoadingOllamaModels(false)
    }
  }

  function onSave() {
    startTransition(async () => {
      try {
        const result = await upsertAiSettingsAction({
          preferredProvider,
          geminiModel,
          geminiApiKey: geminiApiKey.trim() ? geminiApiKey.trim() : undefined,
          ollamaHostUrl,
          ollamaModel,
        })

        if (!result.success) {
          if (result.reason === 'missing_encryption_key') {
            toast.error(t('aiSettings.missingEncryptionKey'))
            return
          }
          if (result.reason === 'migration_missing') {
            toast.error(t('aiSettings.missingMigration'))
            return
          }
          toast.error(t('aiSettings.saveError'))
          return
        }

        setGeminiApiKey('')
        const refreshed = await getAiSettingsAction()
        setHasGeminiApiKey(refreshed.hasGeminiApiKey)
        toast.success(t('aiSettings.saved'))
      } catch (e: any) {
        console.error(e)
        toast.error(e?.message || t('aiSettings.saveError'))
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('aiSettings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('aiSettings.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiSettings.providerTitle')}</CardTitle>
          <CardDescription>{t('aiSettings.providerDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('aiSettings.provider')}</Label>
            <Select value={preferredProvider} onValueChange={(v) => setPreferredProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">{t('aiSettings.provider.openai')}</SelectItem>
                <SelectItem value="gemini">{t('aiSettings.provider.gemini')}</SelectItem>
                <SelectItem value="ollama">{t('aiSettings.provider.ollama')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiSettings.geminiTitle')}</CardTitle>
          <CardDescription>{t('aiSettings.geminiDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t('aiSettings.geminiApiKey')}</Label>
            {hasGeminiApiKey ? (
              <Badge variant="secondary">{t('aiSettings.geminiApiKeySaved')}</Badge>
            ) : null}
          </div>
          <Input
            type="password"
            value={geminiApiKey}
            placeholder={t('aiSettings.geminiApiKeyPlaceholder')}
            onChange={(e) => setGeminiApiKey(e.target.value)}
          />

          <div className="space-y-2">
            <Label>{t('aiSettings.geminiModel')}</Label>
            <Select value={geminiModel} onValueChange={(v) => setGeminiModel(v as GeminiModel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiSettings.ollamaTitle')}</CardTitle>
          <CardDescription>{t('aiSettings.ollamaDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('aiSettings.ollamaHostUrl')}</Label>
            <Input
              value={ollamaHostUrl}
              placeholder={t('aiSettings.ollamaHostUrlPlaceholder')}
              onChange={(e) => setOllamaHostUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={loadOllamaModels}
                disabled={isLoadingOllamaModels || !ollamaHostUrl.trim()}
              >
                {isLoadingOllamaModels ? t('aiSettings.loading') : t('aiSettings.loadOllamaModels')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('aiSettings.ollamaModel')}</Label>
            <Select value={ollamaModel} onValueChange={setOllamaModel}>
              <SelectTrigger>
                <SelectValue placeholder={t('aiSettings.ollamaModelPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {ollamaModels.length ? (
                  ollamaModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__no_models__" disabled>
                    {t('aiSettings.ollamaModelNoModels')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isPending || !canSave}>
          {isPending ? t('aiSettings.saving') : t('aiSettings.save')}
        </Button>
      </div>
    </div>
  )
}
