// Copyright (c) 2026 VeilAssist. All rights reserved.
// Global resume + JD — separate from modes (Natively "Personal Intelligence").

import React, { useMemo } from 'react'
import { Briefcase, FileUser, Upload, X } from 'lucide-react'
import AppIcon from '../shared/AppIcon'
import { SaveStatusBadge, SettingsCollapsible } from './SettingsComponents'

const RESUME_MAX = 50000
const JD_MAX = 30000

export default function PersonalBackgroundSection({
  resumeContext = '',
  jdContext = '',
  resumeSourceName = '',
  profileDocBusy = null,
  onResumeChange,
  onResumeBlur,
  onJdChange,
  onJdBlur,
  onUploadResume,
  onUploadJd,
  onClearResume,
  onClearJd,
  profileSaveStatus = 'idle',
}) {
  const hasContent = Boolean(resumeContext?.trim() || jdContext?.trim())
  const defaultOpen = hasContent

  const statusLabel = useMemo(() => {
    const parts = []
    if (resumeContext?.trim()) parts.push('Resume')
    if (jdContext?.trim()) parts.push('JD')
    return parts.length ? parts.join(' + ') : 'Not set'
  }, [resumeContext, jdContext])

  return (
    <SettingsCollapsible
      title="Personal background"
      description="Used only in Interview, and only when a question is about you."
      badge={hasContent ? statusLabel : null}
      defaultOpen={defaultOpen}
      icon={FileUser}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="mb-1 flex items-center justify-end lg:col-span-2">
          <SaveStatusBadge status={profileSaveStatus} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-200">
              <AppIcon icon={FileUser} size={15} className="text-zinc-500" />
              Resume / CV
            </span>
            {resumeSourceName ? (
              <span className="truncate text-[10px] text-zinc-500" title={resumeSourceName}>
                {resumeSourceName}
              </span>
            ) : null}
          </div>
          <textarea
            value={resumeContext}
            onChange={(e) => onResumeChange?.(e.target.value.slice(0, RESUME_MAX))}
            onBlur={() => onResumeBlur?.()}
            rows={5}
            placeholder="Paste resume text or upload PDF, TXT, or MD…"
            className="input-shadow min-h-[110px] w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={profileDocBusy === 'resume'}
              onClick={() => void onUploadResume?.()}
              className="nat-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-50"
            >
              <AppIcon icon={Upload} size={14} />
              {profileDocBusy === 'resume' ? 'Uploading…' : 'Upload'}
            </button>
            {resumeContext ? (
              <button
                type="button"
                onClick={() => void onClearResume?.()}
                className="btn-danger inline-flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <AppIcon icon={X} size={13} />
                Clear
              </button>
            ) : null}
            <span className="ml-auto font-mono text-[10px] text-zinc-600">
              {(resumeContext || '').length.toLocaleString()} / {RESUME_MAX.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-200">
            <AppIcon icon={Briefcase} size={15} className="text-zinc-500" />
            Job description
          </span>
          <textarea
            value={jdContext}
            onChange={(e) => onJdChange?.(e.target.value.slice(0, JD_MAX))}
            onBlur={() => onJdBlur?.()}
            rows={5}
            placeholder="Paste the role JD — swap per application without changing modes…"
            className="input-shadow min-h-[110px] w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={profileDocBusy === 'jd'}
              onClick={() => void onUploadJd?.()}
              className="nat-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-50"
            >
              <AppIcon icon={Upload} size={14} />
              {profileDocBusy === 'jd' ? 'Uploading…' : 'Upload'}
            </button>
            {jdContext ? (
              <button
                type="button"
                onClick={() => void onClearJd?.()}
                className="btn-danger inline-flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <AppIcon icon={X} size={13} />
                Clear
              </button>
            ) : null}
            <span className="ml-auto font-mono text-[10px] text-zinc-600">
              {(jdContext || '').length.toLocaleString()} / {JD_MAX.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </SettingsCollapsible>
  )
}
