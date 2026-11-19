// Copyright (c) 2026 VeilAssist. All rights reserved.
// Phase 5 — manage local skills invoked via /skill-name in the overlay.

import React, { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createIpcShim } from '../shared/ipcShim'
import AppIcon from '../shared/AppIcon'
import { ConfirmDialog, SettingsFieldLabel, SettingsPanelShell, SettingsSection } from './SettingsComponents'
import { normalizeSkillSlug } from '../../lib/skillInvoke.js'

const ipc = createIpcShim()

export default function SkillsSettingsPanel({ embedded = false }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSlug, setSelectedSlug] = useState('')
  const [draftSlug, setDraftSlug] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = useCallback(async () => {
    if (!ipc) return
    setLoading(true)
    try {
      const list = await ipc.invoke('skills:list')
      setSkills(Array.isArray(list) ? list : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const loadSkill = async (slug) => {
    if (!ipc || !slug) return
    const skill = await ipc.invoke('skills:get', slug)
    if (!skill) return
    setSelectedSlug(skill.slug)
    setDraftSlug(skill.slug)
    setDraftName(skill.name || '')
    setDraftDescription(skill.description || '')
    setDraftBody(skill.body || '')
    setErr('')
    setSaved(false)
  }

  const startNew = () => {
    setSelectedSlug('')
    setDraftSlug('')
    setDraftName('')
    setDraftDescription('')
    setDraftBody('')
    setErr('')
    setSaved(false)
  }

  const saveSkill = async () => {
    if (!ipc) return
    const slug = normalizeSkillSlug(draftSlug)
    if (!slug) {
      setErr('Skill id must start with a letter or number (a-z, 0-9, hyphens).')
      return
    }
    setBusy(true)
    setErr('')
    setSaved(false)
    try {
      const r = await ipc.invoke('skills:save', slug, {
        name: draftName.trim() || slug,
        description: draftDescription.trim(),
        body: draftBody,
      })
      if (!r?.ok) {
        setErr(r?.error || 'Save failed')
        return
      }
      setSelectedSlug(slug)
      setDraftSlug(slug)
      setSaved(true)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const deleteSkill = async () => {
    if (!ipc || !selectedSlug) return
    setBusy(true)
    try {
      await ipc.invoke('skills:delete', selectedSlug)
      startNew()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const addStarter = async (starter) => {
    if (!ipc || !starter?.slug) return
    setBusy(true)
    try {
      await ipc.invoke('skills:save', starter.slug, {
        name: starter.name,
        description: starter.description,
        body: starter.body,
      })
      await refresh()
      await loadSkill(starter.slug)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPanelShell
      embedded={embedded}
      title="Skills"
      description="Custom instructions invoked from the overlay with /skill-name — e.g. /interview or /sales what should I say?"
    >
      <SettingsSection title="How to use">
        <p className="text-[12px] leading-relaxed text-zinc-500">
          Type <span className="font-mono text-zinc-300">/your-skill</span> plus an optional question in the overlay input.
          The skill body is appended to the system prompt for that ask only — no change to speech or screen capture.
        </p>
      </SettingsSection>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        <SettingsSection title="Your skills" className="!p-0">
          <div className="nat-section-body space-y-2 px-4 pb-4">
            <button
              type="button"
              onClick={startNew}
              className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-xs"
            >
              <AppIcon icon={Plus} size={14} />
              New skill
            </button>
            {loading ? (
              <p className="text-xs text-zinc-600">Loading…</p>
            ) : skills.length === 0 ? (
              <p className="text-xs text-zinc-600">No skills yet.</p>
            ) : (
              <ul className="space-y-1">
                {skills.map((s) => (
                  <li key={s.slug}>
                    <button
                      type="button"
                      onClick={() => void loadSkill(s.slug)}
                      className={[
                        'w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 focus-visible:-outline-offset-2',
                        selectedSlug === s.slug
                          ? 'bg-white/[0.08] text-white'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                      ].join(' ')}
                    >
                      <span className="font-mono text-[11px] text-accent">/{s.slug}</span>
                      <span className="mt-0.5 block truncate font-medium">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={selectedSlug ? `Edit /${selectedSlug}` : 'New skill'}>
          <div className="space-y-4">
            <div>
              <SettingsFieldLabel>Skill id (folder name)</SettingsFieldLabel>
              <input
                type="text"
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value)}
                placeholder="interview"
                disabled={!!selectedSlug}
                className="input-shadow w-full max-w-sm px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-[10px] text-zinc-600">Invoke as /{normalizeSkillSlug(draftSlug) || 'skill-id'}</p>
            </div>
            <div>
              <SettingsFieldLabel>Display name</SettingsFieldLabel>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="input-shadow w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <SettingsFieldLabel>Short description</SettingsFieldLabel>
              <input
                type="text"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                className="input-shadow w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <SettingsFieldLabel>Instructions (markdown)</SettingsFieldLabel>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={14}
                placeholder="Extra system instructions when this skill is active…"
                className="input-shadow w-full resize-y px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
            {err ? <p className="text-xs text-rose-300">{err}</p> : null}
            {saved ? <p className="text-xs text-emerald-400/90">Saved.</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void saveSkill()} className="btn-glow px-4 py-2 text-xs">
                {busy ? 'Saving…' : 'Save skill'}
              </button>
              {selectedSlug ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="btn-danger flex items-center gap-1 px-3 py-2 text-xs"
                >
                  <AppIcon icon={Trash2} size={14} />
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </SettingsSection>
      </div>

      <SettingsSection title="Starter templates">
        <p className="mb-3 text-[11px] text-zinc-600">One-click install — you can edit the text after adding.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void addStarter({ slug: 'interview', name: 'Interview coach', description: 'Technical and behavioral interview help.', body: STARTER_INTERVIEW })}
            className="btn-ghost px-3 py-2 text-xs"
          >
            + Interview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addStarter({ slug: 'sales', name: 'Sales call', description: 'Discovery and objection handling.', body: STARTER_SALES })}
            className="btn-ghost px-3 py-2 text-xs"
          >
            + Sales
          </button>
        </div>
      </SettingsSection>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete skill "/${selectedSlug}"?`}
        description="This permanently removes the skill. It can no longer be invoked from the overlay."
        confirmLabel="Delete skill"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          void deleteSkill()
        }}
      />
    </SettingsPanelShell>
  )
}

const STARTER_INTERVIEW = `You are an interview coach. Keep answers speakable in 2–4 sentences unless the user asks for depth.
- Prefer STAR format for behavioral questions.
- For technical questions: clarify assumptions, outline approach, then give a concise answer.
- Flag weak phrasing and suggest stronger wording.`

const STARTER_SALES = `You are a sales copilot on a live call. Be concise and speakable.
- Mirror the prospect's language.
- Surface pain, impact, and decision process when relevant.
- Suggest one clear next step; avoid pushy closing language.`
