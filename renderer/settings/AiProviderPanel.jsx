// Copyright (c) 2026 VeilAssist. All rights reserved.
// AI Provider tab: pick the vendor, save its key, choose the model, test the connection, set a fallback.

import React, { useMemo, useRef } from 'react'
import {
  CheckmarkSelect,
  ModelInput,
  SecretKeyField,
  SettingsFieldLabel,
  SettingsPanelShell,
  SettingsSection,
} from './SettingsComponents'
import { useBrand } from '../shared/branding'

function ProviderPills({ providerMeta, provider, onSelectProvider }) {
  const refs = useRef([])
  const activeIndex = Math.max(
    0,
    providerMeta.findIndex((pm) => pm.id === provider),
  )
  const move = (to) => {
    const i = (to + providerMeta.length) % providerMeta.length
    onSelectProvider(providerMeta[i].id)
    refs.current[i]?.focus()
  }
  const onKeyDown = (e, index) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(providerMeta.length - 1)
    }
  }
  return (
    <div className="settings-advance-pills" role="radiogroup" aria-label="AI provider">
      {providerMeta.map((pm, index) => {
        const active = pm.id === provider
        return (
          <button
            key={pm.id}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === activeIndex ? 0 : -1}
            className={`settings-advance-pill ${active ? 'settings-advance-pill-active' : ''}`}
            onClick={() => onSelectProvider(pm.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {pm.label}
          </button>
        )
      })}
    </div>
  )
}

export default function AiProviderPanel({
  embedded = false,
  snap,
  providerMeta,
  provider,
  onSelectProvider,
  keySetMap,
  secretByProvider,
  setSecretByProvider,
  onSaveKey,
  chatVendor,
  chatKf,
  chatKeySaved,
  chatMf,
  chatModel,
  onPatchSnap,
  onSave,
  chatOpts,
  onSyncModels,
  chatListLoading,
  chatListErr,
  modelCatalog,
  chatTest,
  chatTesting,
  onTestConnection,
  showSetupBanner,
  onLaunchFromSetup,
}) {
  const { name } = useBrand()

  const modelOptions = useMemo(
    () => (chatOpts || []).map((m) => ({ id: m, label: m })),
    [chatOpts],
  )

  // Opt-in second provider for when the active one fails (403 / rate limit / timeout). Only providers
  // with a saved key are offered, and never the active one.
  const fallbackOptions = useMemo(
    () => [
      { id: 'none', label: 'None' },
      ...(providerMeta || [])
        .filter((pm) => pm.id !== provider && keySetMap?.[pm.keyField])
        .map((pm) => ({ id: pm.id, label: pm.label })),
    ],
    [providerMeta, provider, keySetMap],
  )
  const fallbackValue = fallbackOptions.some((o) => o.id === snap?.chatFallbackProvider)
    ? snap.chatFallbackProvider
    : 'none'

  const ready = !!snap && !!providerMeta?.length
  const hasVendor = ready && !!chatVendor

  return (
    <SettingsPanelShell
      embedded={embedded}
      title="AI Provider"
      description="Choose the model that writes your answers. Your key stays on this device."
    >
      {!ready ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }} role="status">
          Loading providers…
        </p>
      ) : (
        <>
          <SettingsSection title="Provider" anchor="provider">
            <div className="settings-advance-ai-block">
              <ProviderPills providerMeta={providerMeta} provider={provider} onSelectProvider={onSelectProvider} />
            </div>

            {hasVendor && chatVendor.kind === 'anthropic' ? (
              <p className="settings-advance-ai-note">
                Claude uses the Anthropic Messages API, not the OpenAI-compatible one. The model ID must match your
                Anthropic account.
              </p>
            ) : null}

            {hasVendor && chatVendor.usesCustomBase ? (
              <div className="settings-advance-ai-block settings-advance-ai-divider">
                <SettingsFieldLabel htmlFor="settings-custom-base-url">Base URL</SettingsFieldLabel>
                <input
                  id="settings-custom-base-url"
                  type="url"
                  value={snap.customOpenaiBaseUrl || ''}
                  onChange={(e) => onPatchSnap('customOpenaiBaseUrl', e.target.value)}
                  onBlur={(e) => onSave('customOpenaiBaseUrl', e.target.value.trim())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSave('customOpenaiBaseUrl', e.currentTarget.value.trim())
                  }}
                  className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            ) : null}
          </SettingsSection>

          {hasVendor ? (
            <>
              <SettingsSection title="API key" anchor="api-key">
                <div className="settings-advance-ai-block">
                  <SecretKeyField
                    label={`${chatVendor.label || 'Provider'} API key`}
                    saved={chatKeySaved}
                    placeholder="Paste API key here"
                    value={secretByProvider[chatVendor.id] ?? ''}
                    onChange={(v) => setSecretByProvider((m) => ({ ...m, [chatVendor.id]: v }))}
                    onSave={(text) => (chatKf ? onSaveKey(chatKf, text, chatVendor.id) : false)}
                    hint={
                      <>
                        {chatVendor.docs ? (
                          <a
                            href={chatVendor.docs}
                            target="_blank"
                            rel="noreferrer"
                            className="settings-advance-ai-link"
                          >
                            Get API key ↗
                          </a>
                        ) : null}
                        {['groq', 'openai', 'nvidia'].includes(chatVendor.id) ? (
                          <p className="settings-advance-ai-hint">Shared with Audio speech recognition.</p>
                        ) : null}
                      </>
                    }
                  />
                </div>
              </SettingsSection>

              <SettingsSection title="Model" anchor="model">
                {chatMf && chatOpts.length > 0 ? (
                  <div className="settings-advance-ai-block settings-advance-ai-model-row">
                    <div className="min-w-0 flex-1">
                      <p id="settings-chat-model-label" className="settings-advance-ai-label">
                        Model
                      </p>
                      <p className="settings-advance-ai-hint" style={{ marginTop: 2 }}>
                        Screen questions need a model that accepts images.
                      </p>
                    </div>
                    <CheckmarkSelect
                      value={chatModel || chatVendor.defaultModel || chatOpts[0]}
                      onChange={(v) => {
                        onPatchSnap(chatMf, v)
                        onSave(chatMf, v)
                      }}
                      options={modelOptions}
                      menuMinWidth={280}
                      className="settings-advance-model-dd"
                      aria-labelledby="settings-chat-model-label"
                    />
                  </div>
                ) : null}

                {chatMf && chatOpts.length === 0 ? (
                  <div className="settings-advance-ai-block">
                    <ModelInput
                      label={
                        chatListLoading
                          ? 'Loading models…'
                          : chatKeySaved
                            ? 'Model ID'
                            : 'Model ID (save key to sync list)'
                      }
                      value={chatModel}
                      onChange={(v) => onPatchSnap(chatMf, v)}
                      onCommit={(v) => onSave(chatMf, v)}
                      suggestions={
                        modelCatalog[chatVendor.id] ||
                        (chatVendor.defaultModel ? [chatVendor.defaultModel] : [])
                      }
                      hint="Save your key, then use Sync models to load the full list."
                    />
                  </div>
                ) : null}

                {chatListErr ? (
                  <p className="settings-advance-ai-hint" style={{ color: 'var(--text-primary)' }} role="status">
                    {chatListErr}
                  </p>
                ) : null}

                <div className="settings-advance-ai-actions settings-advance-ai-divider" data-settings-anchor="test-connection">
                  <button
                    type="button"
                    onClick={() => onSyncModels(chatVendor.id)}
                    disabled={chatListLoading}
                    className="btn-ghost px-3.5 py-2 text-xs"
                  >
                    {chatListLoading ? 'Syncing…' : 'Sync models'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTestConnection(chatVendor.id)}
                    disabled={chatTesting}
                    className="btn-ghost px-3.5 py-2 text-xs disabled:opacity-50"
                  >
                    {chatTesting ? 'Testing…' : 'Test connection'}
                  </button>
                  {showSetupBanner && embedded ? (
                    <button type="button" onClick={onLaunchFromSetup} className="btn-glow px-3.5 py-2 text-xs">
                      Launch
                    </button>
                  ) : null}
                </div>

                <p
                  className="settings-advance-ai-hint"
                  role="status"
                  style={{ color: chatTest ? (chatTest.success ? 'var(--text-secondary)' : 'var(--text-primary)') : undefined }}
                >
                  {chatTest
                    ? chatTest.success
                      ? 'Connection verified'
                      : chatTest.error
                    : chatKeySaved
                      ? 'Run a test to verify your saved key.'
                      : 'Save a key, then run a test.'}
                </p>
              </SettingsSection>

              <SettingsSection title="Fallback provider" anchor="fallback-provider">
                <div className="settings-advance-ai-block settings-advance-ai-model-row">
                  <div className="min-w-0 flex-1">
                    <p id="settings-fallback-label" className="settings-advance-ai-label">
                      Fallback provider
                    </p>
                    <p className="settings-advance-ai-hint" style={{ marginTop: 2 }}>
                      Used if {chatVendor.label} fails before answering (403, rate limit, timeout). Only providers
                      with a saved key are listed. Screen questions need a vision-capable fallback.
                    </p>
                  </div>
                  <CheckmarkSelect
                    value={fallbackValue}
                    onChange={(v) => {
                      const next = v === 'none' ? '' : v
                      onPatchSnap('chatFallbackProvider', next)
                      onSave('chatFallbackProvider', next)
                    }}
                    options={fallbackOptions}
                    menuMinWidth={220}
                    className="settings-advance-model-dd"
                    aria-labelledby="settings-fallback-label"
                  />
                </div>
              </SettingsSection>
            </>
          ) : null}
        </>
      )}

      {showSetupBanner && !embedded ? (
        <button type="button" onClick={onLaunchFromSetup} className="btn-glow mt-4 w-full py-4 text-base">
          Launch {name}
        </button>
      ) : null}
    </SettingsPanelShell>
  )
}
