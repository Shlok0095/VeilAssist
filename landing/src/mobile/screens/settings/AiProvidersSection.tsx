import type { AppSettings } from '../../profileTypes'
import { CHAT_MODEL_CATALOG } from '../../modelCatalog'
import { groqModelOptions, nvidiaModelOptions, vendorFallbackHint } from '../../modelDisplay'
import { CHAT_PROVIDER_ORDER, CHAT_PROVIDERS, providerKeyConfigured } from '../../providerRegistry'
import { loadAppSettings } from '../../profileStorage'
import { syncChatModels } from '../../modelSync'
import { ModelSelect } from './ModelSelect'
import { ProviderConfigSection } from './ProviderConfigSection'

export function AiProvidersSection({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}) {
  const meta = CHAT_PROVIDERS.find((p) => p.id === settings.provider)!
  const keyValue = String(settings[meta.keyField] || '')
  const modelValue = String(settings[meta.modelField] || '')
  const keySaved = providerKeyConfigured(settings, meta.id)

  const providerOptions = CHAT_PROVIDER_ORDER.map((id) => {
    const p = CHAT_PROVIDERS.find((x) => x.id === id)!
    return {
      value: id,
      label: `${p.badge} · ${p.label}${providerKeyConfigured(settings, id) ? ' ✓' : ''}`,
    }
  })

  const modelOptions =
    meta.id === 'nvidia'
      ? nvidiaModelOptions()
      : meta.id === 'groq'
        ? groqModelOptions()
        : (CHAT_MODEL_CATALOG[meta.id] || [meta.defaultModel]).map((m) => ({ value: m, label: m }))

  return (
    <ProviderConfigSection
      groupLabel="AI providers"
      intro="NVIDIA answers first with the model you pick. If that model fails, the next-fastest NVIDIA is tried, then Groq. Models are not all run at once."
      selectLabel="Provider"
      value={settings.provider}
      onChange={(v) => onChange({ provider: v as AppSettings['provider'] })}
      options={providerOptions}
      badge={meta.badge}
      title={meta.label}
      keySaved={keySaved}
      docs={meta.docs}
      description={meta.desc}
    >

      {meta.baseUrlField ? (
        <label className="mobile-field">
          <span>Base URL</span>
          <input
            className="mobile-input"
            value={String(settings[meta.baseUrlField] || '')}
            onChange={(e) =>
              onChange({ [meta.baseUrlField!]: e.target.value } as Partial<AppSettings>)
            }
            placeholder="https://your-server.com/v1"
          />
        </label>
      ) : null}

      <label className="mobile-field">
        <span>API key</span>
        <input
          className="mobile-input"
          type="password"
          value={keyValue}
          onChange={(e) => onChange({ [meta.keyField]: e.target.value } as Partial<AppSettings>)}
          placeholder={keySaved ? '••••••••' : 'Paste API key'}
        />
      </label>

      <label className="mobile-field">
        <span>Model</span>
        <ModelSelect
          value={modelValue}
          options={modelOptions}
          placeholder={meta.defaultModel}
          onChange={(m) => onChange({ [meta.modelField]: m } as Partial<AppSettings>)}
          onSync={
            import.meta.env.VITE_MOBILE_APK
              ? undefined
              : () => syncChatModels(meta.id, loadAppSettings())
          }
        />
        {meta.id === 'nvidia' || meta.id === 'groq' ? (
          <p className="mobile-fallback-hint">{vendorFallbackHint(meta.id)}</p>
        ) : null}
      </label>
    </ProviderConfigSection>
  )
}
