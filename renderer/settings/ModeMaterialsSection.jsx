// Copyright (c) 2026 VeilAssist. Meeting prompt/documents and General purposes.

import React, { useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import AppIcon from '../shared/AppIcon'
import { ConfirmDialog } from './SettingsComponents'
import SelectRow from './SelectRow'

function Field({ label, value, onChange, multiline = false, placeholder = '' }) {
  const className = 'input-shadow mt-1 w-full px-3 py-2 text-[13px]'
  return (
    <label className="block text-[11px] text-zinc-500">
      {label}
      {multiline ? (
        <textarea value={value || ''} placeholder={placeholder} rows={4} onChange={(event) => onChange(event.target.value)} className={className} />
      ) : (
        <input value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={className} />
      )}
    </label>
  )
}

function DocumentEditor({ document, onChange }) {
  if (!document) return <p className="text-[11px] text-zinc-500">No document yet. Upload one to structure it.</p>
  return (
    <div className="space-y-2">
      <Field label="Title" value={document.title} onChange={(title) => onChange({ ...document, title })} />
      <Field label="Summary" value={document.summary} onChange={(summary) => onChange({ ...document, summary })} multiline />
      <Field
        label="Key points"
        value={(document.keyPoints || []).join('\n')}
        onChange={(text) => onChange({ ...document, keyPoints: text.split('\n').map((line) => line.trim()).filter(Boolean) })}
        multiline
      />
      {(document.sections || []).map((section) => (
        <div key={section.id} className="space-y-2 rounded-lg border border-white/10 px-3 py-2">
          <Field
            label="Section"
            value={section.heading}
            onChange={(heading) =>
              onChange({
                ...document,
                sections: document.sections.map((item) => (item.id === section.id ? { ...item, heading } : item)),
              })
            }
          />
          <Field
            label="Detail"
            value={section.body}
            onChange={(body) =>
              onChange({
                ...document,
                sections: document.sections.map((item) => (item.id === section.id ? { ...item, body } : item)),
              })
            }
            multiline
          />
        </div>
      ))}
    </div>
  )
}

function AdditionalDocumentsBlock({
  documents = [],
  activeDocumentId = '',
  busy = false,
  error = '',
  emptyHint = 'Upload a document. It is structured and saved. Answers use the one you select.',
  uploadDisabled = false,
  onUpload,
  onSelect,
  onChange,
  onDelete,
}) {
  const [openId, setOpenId] = useState('')
  const [confirmDocId, setConfirmDocId] = useState('')
  const selected = documents.find((doc) => doc.id === activeDocumentId) || null
  const confirmDoc = documents.find((doc) => doc.id === confirmDocId) || null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-zinc-100">Additional documents</p>
          <p className="text-[11px] text-zinc-500">
            {documents.length
              ? `${documents.length} saved · ${selected?.title || 'None'} selected`
              : emptyHint}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs"
          disabled={busy || uploadDisabled}
          onClick={() => onUpload?.()}
        >
          <AppIcon icon={Upload} size={14} />
          {busy ? 'Structuring…' : 'Upload document'}
        </button>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="space-y-2" role="radiogroup" aria-label="Additional documents" hidden={!documents.length}>
      {documents.map((doc) => {
        const expanded = doc.id === openId
        return (
          <SelectRow
            key={doc.id}
            group="mode-document"
            title={doc.title || doc.sourceFileName || 'Document'}
            subtitle={doc.summary}
            pickLabel={`Use ${doc.title || doc.sourceFileName || 'this document'} for answers`}
            selected={doc.id === activeDocumentId}
            expanded={expanded}
            onSelect={() => onSelect?.(doc.id)}
            onToggle={() => setOpenId(expanded ? '' : doc.id)}
          >
            <DocumentEditor document={doc} onChange={(next) => onChange?.(documents.map((item) => (item.id === doc.id ? next : item)))} />
            <button type="button" className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs" onClick={() => setConfirmDocId(doc.id)}>
              <AppIcon icon={Trash2} size={14} />
              Remove document
            </button>
          </SelectRow>
        )
      })}
      </div>
      <ConfirmDialog
        open={!!confirmDoc}
        title="Remove this document?"
        description={`"${confirmDoc?.title || confirmDoc?.sourceFileName || 'This document'}" will be deleted from this device. This cannot be undone.`}
        confirmLabel="Remove document"
        onCancel={() => setConfirmDocId('')}
        onConfirm={() => {
          const id = confirmDocId
          setConfirmDocId('')
          if (id) onDelete?.(id)
        }}
      />
    </div>
  )
}

export function MeetingMaterialsSection({
  prompt = '',
  documents = [],
  activeDocumentId = '',
  busy = false,
  error = '',
  onPromptChange,
  onUpload,
  onSelect,
  onChange,
  onDelete,
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Prompt"
        value={prompt}
        placeholder="What this meeting is for. Example: weekly standup, capture owners and deadlines."
        onChange={onPromptChange}
        multiline
      />
      <AdditionalDocumentsBlock
        documents={documents}
        activeDocumentId={activeDocumentId}
        busy={busy}
        error={error}
        onUpload={onUpload}
        onSelect={onSelect}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

export function GeneralPurposeSection({
  purposes = [],
  activePurposeId = '',
  busy = false,
  error = '',
  onCreate,
  onUpload,
  onSelect,
  onChange,
  onDelete,
}) {
  const [openId, setOpenId] = useState('')
  const [confirmPurposeId, setConfirmPurposeId] = useState('')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const selected = purposes.find((item) => item.id === activePurposeId) || null
  const confirmPurpose = purposes.find((item) => item.id === confirmPurposeId) || null
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-medium text-zinc-100">Purpose</p>
        <p className="text-[11px] text-zinc-500">
          {purposes.length
            ? `${purposes.length} saved · ${selected?.name || 'None'} selected`
            : 'Save a purpose, then add a document. Answers use the purpose you select.'}
        </p>
      </div>
      <form
        className="space-y-2 rounded-xl border border-white/10 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          const nextName = name.trim()
          if (!nextName && !prompt.trim()) return
          onCreate?.({ name: nextName || 'Purpose', prompt: prompt.trim() })
          setName('')
          setPrompt('')
        }}
      >
        <Field label="Purpose name" value={name} onChange={setName} placeholder="Recruitment" />
        <Field
          label="Purpose prompt"
          value={prompt}
          onChange={setPrompt}
          placeholder="Help me hire a QA engineer. Use the attached hiring document."
          multiline
        />
        <button type="submit" className="btn-ghost px-3 py-2 text-xs">
          Save purpose
        </button>
      </form>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="space-y-2" role="radiogroup" aria-label="Purposes" hidden={!purposes.length}>
      {purposes.map((purpose) => {
        const expanded = purpose.id === openId
        return (
          <SelectRow
            key={purpose.id}
            group="general-purpose"
            title={purpose.name || 'Purpose'}
            subtitle={purpose.document?.title || purpose.documents?.[0]?.title || purpose.prompt}
            pickLabel={`Use ${purpose.name || 'this purpose'} for answers`}
            selected={purpose.id === activePurposeId}
            expanded={expanded}
            onSelect={() => onSelect?.(purpose.id)}
            onToggle={() => setOpenId(expanded ? '' : purpose.id)}
          >
            <Field label="Purpose name" value={purpose.name} onChange={(next) => onChange?.({ ...purpose, name: next })} />
            <Field label="Purpose prompt" value={purpose.prompt} onChange={(next) => onChange?.({ ...purpose, prompt: next })} multiline />
            <button type="button" className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs" onClick={() => setConfirmPurposeId(purpose.id)}>
              <AppIcon icon={Trash2} size={14} />
              Remove purpose
            </button>
          </SelectRow>
        )
      })}
      </div>
      <ConfirmDialog
        open={!!confirmPurpose}
        title="Remove this purpose?"
        description={`"${confirmPurpose?.name || 'This purpose'}" and its documents will be deleted from this device. This cannot be undone.`}
        confirmLabel="Remove purpose"
        onCancel={() => setConfirmPurposeId('')}
        onConfirm={() => {
          const id = confirmPurposeId
          setConfirmPurposeId('')
          if (id) onDelete?.(id)
        }}
      />
      <AdditionalDocumentsBlock
        documents={selected?.documents || (selected?.document ? [selected.document] : [])}
        activeDocumentId={selected?.activeDocumentId || selected?.document?.id || ''}
        busy={busy}
        error={error}
        uploadDisabled={!selected}
        emptyHint={
          selected
            ? 'Upload a document for this purpose. Answers use the one you select.'
            : 'Save a purpose first, then upload additional documents.'
        }
        onUpload={() => selected && onUpload?.(selected.id)}
        onSelect={(id) => selected && onChange?.({ ...selected, activeDocumentId: id, document: (selected.documents || []).find((doc) => doc.id === id) || selected.document })}
        onChange={(nextDocs) => {
          if (!selected) return
          const nextActive = nextDocs.some((doc) => doc.id === selected.activeDocumentId)
            ? selected.activeDocumentId
            : nextDocs[0]?.id || ''
          onChange?.({
            ...selected,
            documents: nextDocs,
            activeDocumentId: nextActive,
            document: nextDocs.find((doc) => doc.id === nextActive) || null,
          })
        }}
        onDelete={(id) => {
          if (!selected) return
          const nextDocs = (selected.documents || []).filter((doc) => doc.id !== id)
          const nextActive = selected.activeDocumentId === id ? nextDocs[0]?.id || '' : selected.activeDocumentId
          onChange?.({
            ...selected,
            documents: nextDocs,
            activeDocumentId: nextActive,
            document: nextDocs.find((doc) => doc.id === nextActive) || null,
          })
        }}
      />
    </div>
  )
}
