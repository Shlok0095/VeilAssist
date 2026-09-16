// Copyright (c) 2026 VeilAssist. All rights reserved.

import React, { useMemo } from 'react'
import {
  CheckmarkSelect,
  ModelInput,
  SettingsPanelShell,
} from './SettingsComponents'
import { useBrand } from '../shared/branding'

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

  return (
    <SettingsPanelShell embedded={embedded}>
      {!snap || !providerMeta.length ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Loading providers…
        </p>
      ) : (
        <div className="settings-advance-ai">
          <div className="settings-advance-ai-block">
            <p className="settings-advance-ai-label">Provider</p>
            <div className="settings-advance-pills" role="list">
              {providerMeta.map((pm) => {
                const active = pm.id === provider
                return (
                  <button
                    key={pm.id}
                    type="button"
                    role="listitem"
                    className={`settings-advance-pill ${active ? 'settings-advance-pill-active' : ''}`}
                    onClick={() => onSelectProvider(pm.id)}
                  >
                    {pm.label}
                  </button>
                )
              })}
            </div>
          </div>

          {chatVendor && snap ? (
            <>
              {chatVendor.kind === 'anthropic' ? (
                <p className="settings-advance-ai-note">
                  Claude uses the Anthropic Messages API — not OpenAI-compatible. Model ID must match your
                  Anthropic account.
                </p>
              ) : null}

              {chatVendor.usesCustomBase ? (
                <div className="settings-advance-ai-block settings-advance-ai-divider">
                  <p className="settings-advance-ai-label">Base URL</p>
                  <input
                    type="url"
                    value={snap.customOpenaiBaseUrl || ''}
                    onChange={(e) => onPatchSnap('customOpenaiBaseUrl', e.target.value)}
                    onBlur={(e) => onSave('customOpenaiBaseUrl', e.target.value.trim())}
                    className="input-shadow w-full px-3 py-2.5 font-mono text-xs"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
              ) : null}

              <div className="settings-advance-ai-block settings-advance-ai-divider">
                <div className="settings-advance-ai-row-head">
                  <p className="settings-advance-ai-label">API key</p>
                  {chatKeySaved ? (
                    <span className="settings-advance-badge rounded-full border px-[7px] py-0.5 text-[10px] font-semibold">
                      Saved
                    </span>
                  ) : null}
                </div>
                <div className="settings-advance-ai-key-row">
                  <input
                    type="password"
                    value={secretByProvider[chatVendor.id] ?? ''}
                    onChange={(e) =>
                      setSecretByProvider((m) => ({ ...m, [chatVendor.id]: e.target.value }))
                    }
                    placeholder={chatKeySaved ? '••••••••••••••••' : 'Paste API key here'}
                    className="input-shadow min-w-0 flex-1 px-3 py-2.5 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      chatKf && onSaveKey(chatKf, secretByProvider[chatVendor.id] || '', chatVendor.id)
                    }
                    className="btn-ghost shrink-0 px-3.5 py-2.5 text-xs"
                  >
                    Save
                  </button>
                </div>
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
                  <p className="settings-advance-ai-hint">
                    Shared with Audio STT.
                  </p>
                ) : null}
              </div>

              {chatMf && chatOpts.length > 0 ? (
                <div className="settings-advance-ai-block settings-advance-ai-divider settings-advance-ai-model-row">
                  <div className="min-w-0 flex-1">
                    <p className="settings-advance-ai-label">Model</p>
                    <p className="settings-advance-ai-hint" style={{ marginTop: 2 }}>
                      Vision for screen Ask
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
                    aria-label="Chat model"
                  />
                </div>
              ) : null}

              {chatMf && chatOpts.length === 0 ? (
                <div className="settings-advance-ai-block settings-advance-ai-divider">
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
                <p className="settings-advance-ai-hint" style={{ color: 'var(--text-primary)' }}>
                  {chatListErr}
                </p>
              ) : null}

              <div className="settings-advance-ai-actions settings-advance-ai-divider">
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
                {showSetupBanner ? (
                  <button type="button" onClick={onLaunchFromSetup} className="btn-glow px-3.5 py-2 text-xs">
                    Launch
                  </button>
                ) : null}
              </div>

              {chatTest ? (
                <p
                  className="settings-advance-ai-hint"
                  style={{ color: chatTest.success ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                >
                  {chatTest.success ? 'Connection verified' : chatTest.error}
                </p>
              ) : (
                <p className="settings-advance-ai-hint">
                  {chatKeySaved ? 'Run a test to verify your saved key.' : 'Save a key, then run a test.'}
                </p>
              )}
            </>
          ) : null}
        </div>
      )}

      {showSetupBanner && !embedded ? (
        <button type="button" onClick={onLaunchFromSetup} className="btn-glow mt-4 w-full py-4 text-base">
          Launch {name}
        </button>
      ) : null}
    </SettingsPanelShell>
  )
}
