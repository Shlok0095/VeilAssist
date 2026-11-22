// Copyright (c) 2026 VeilAssist. Interview resumes — upload, extract, select.

import React, { useState } from 'react'
import { ChevronDown, GripVertical, Trash2, Upload } from 'lucide-react'
import AppIcon from '../shared/AppIcon'
import { ConfirmDialog } from './SettingsComponents'
import SelectRow from './SelectRow'
import { useDraftSetting } from './useDraftSetting'

function resumeTitle(resume) {
  return String(resume?.name || '').trim() || String(resume?.sourceFileName || '').trim() || 'Resume'
}

function resumeSubtitle(resume) {
  const role = String(resume?.suggestedInterviewType || '').trim()
  if (role) return role
  const job = (resume?.experience || []).find((item) => item?.title)
  if (!job) return 'No role extracted'
  return [job.title, job.company].filter(Boolean).join(' at ')
}

function moveItem(list, from, to) {
  if (!Array.isArray(list) || from === to) return list
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function InterviewResumesSection({
  resumes = [],
  activeResumeId = '',
  busy = false,
  error = '',
  onUpload,
  onSelect,
  onChange,
  onDelete,
}) {
  const [openId, setOpenId] = useState('')
  const open = resumes.find((resume) => resume.id === openId) || null
  const selected = resumes.find((resume) => resume.id === activeResumeId) || resumes[0] || null
  const countLabel = resumes.length === 1 ? '1 resume' : `${resumes.length} resumes`

  const patchOpen = (partial) => {
    if (!open) return
    onChange?.(
      resumes.map((resume) => (resume.id === open.id ? { ...resume, ...partial, updatedAt: Date.now() } : resume)),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-zinc-100">Resumes</p>
          <p className="text-[11px] text-zinc-500">
            {resumes.length
              ? `${countLabel} · ${resumeSubtitle(selected)} selected`
              : 'Upload a resume. Interview answers use the one you select.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs"
          disabled={busy}
          onClick={() => onUpload?.()}
        >
          <AppIcon icon={Upload} size={14} />
          {busy ? 'Extracting…' : 'Upload resume'}
        </button>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      {resumes.length ? (
        <div className="space-y-2" role="radiogroup" aria-label="Resumes">
          {resumes.map((resume) => {
            const selectedRow = resume.id === (selected?.id || '')
            const expanded = resume.id === openId
            return (
              // The radio dot picks the resume interview answers use; the whole bar opens its details.
              <SelectRow
                key={resume.id}
                group="interview-resume"
                title={resumeTitle(resume)}
                subtitle={resumeSubtitle(resume)}
                pickLabel={`Use ${resumeTitle(resume)} for interview answers`}
                selected={selectedRow}
                expanded={expanded}
                onSelect={() => onSelect?.(resume.id)}
                onToggle={() => setOpenId(expanded ? '' : resume.id)}
                bareBody
              >
                <ResumeEditor
                  resume={resume}
                  onChange={patchOpen}
                  onDelete={() => {
                    setOpenId('')
                    onDelete?.(resume.id)
                  }}
                />
              </SelectRow>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function ResumeEditor({ resume, onChange, onDelete }) {
  const [skillDraft, setSkillDraft] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const setExperience = (id, partial) => {
    onChange({
      experience: (resume.experience || []).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    })
  }
  const setProject = (id, partial) => {
    onChange({
      projects: (resume.projects || []).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    })
  }
  const setEducation = (id, partial) => {
    onChange({
      education: (resume.education || []).map((item) => (item.id === id ? { ...item, ...partial } : item)),
    })
  }

  return (
    <div className="space-y-4 border-t border-white/10 px-3 py-3">
      <Section title="Basic Info">
        <Field label="Name" value={resume.name} onChange={(name) => onChange({ name })} />
        <Field
          label="Professional Summary"
          value={resume.summary}
          onChange={(summary) => onChange({ summary })}
          multiline
        />
        <Field
          label="Interview type"
          value={resume.suggestedInterviewType}
          onChange={(suggestedInterviewType) => onChange({ suggestedInterviewType })}
          placeholder="e.g. Senior QA Automation Engineer"
        />
      </Section>

      <Section
        title="Work Experience"
        hint="Show your relevant experience. Use bullet points with numbers and facts — e.g., 'Increased sales by 30%' or 'Led a team of 5 engineers'."
      >
        {(resume.experience || []).map((job, index) => (
          <ItemCard
            key={job.id}
            title={[job.title, job.company].filter(Boolean).join(' at ') || 'Experience'}
            secondary={job.dateRange}
            index={index}
            onReorder={(from, to) => onChange({ experience: moveItem(resume.experience || [], from, to) })}
            onRemove={() => onChange({ experience: resume.experience.filter((item) => item.id !== job.id) })}
          >
            <Field label="Job title" value={job.title} onChange={(title) => setExperience(job.id, { title })} />
            <Field label="Company" value={job.company} onChange={(company) => setExperience(job.id, { company })} />
            <Field
              label="Dates"
              value={job.dateRange}
              onChange={(dateRange) => setExperience(job.id, { dateRange })}
              placeholder="Sep 2023 - Present"
            />
            <Field
              label="Highlights"
              value={job.bullets}
              onChange={(bullets) => setExperience(job.id, { bullets })}
              multiline
            />
          </ItemCard>
        ))}
        <AddButton
          label="Add one more experience"
          onClick={() =>
            onChange({
              experience: [
                ...(resume.experience || []),
                { id: `exp-${Date.now()}`, title: '', company: '', dateRange: '', bullets: '' },
              ],
            })
          }
        />
      </Section>

      <Section title="Skills" hint="Tags from the resume. Remove one, or add one.">
        <div className="flex flex-wrap gap-1.5">
          {(resume.skills || []).map((skill) => (
            <span key={skill} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-200">
              {skill}
              <button
                type="button"
                className="-my-1 -mr-1.5 inline-flex min-h-[24px] min-w-[24px] items-center justify-center text-zinc-500"
                aria-label={`Remove ${skill}`}
                onClick={() => onChange({ skills: resume.skills.filter((item) => item !== skill) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const skill = skillDraft.trim()
            if (!skill) return
            if (!(resume.skills || []).some((item) => item.toLowerCase() === skill.toLowerCase())) {
              onChange({ skills: [...(resume.skills || []), skill] })
            }
            setSkillDraft('')
          }}
        >
          <input
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            placeholder="Add a skill"
            className="input-shadow min-w-0 flex-1 px-3 py-2 text-xs"
          />
          <button type="submit" className="btn-ghost px-3 py-2 text-xs">
            Add
          </button>
        </form>
      </Section>

      <Section title="Projects">
        {(resume.projects || []).map((project, index) => (
          <ItemCard
            key={project.id}
            title={project.name || 'Project'}
            secondary={project.tech}
            index={index}
            onReorder={(from, to) => onChange({ projects: moveItem(resume.projects || [], from, to) })}
            onRemove={() => onChange({ projects: resume.projects.filter((item) => item.id !== project.id) })}
          >
            <Field label="Project" value={project.name} onChange={(name) => setProject(project.id, { name })} />
            <Field label="Technologies" value={project.tech} onChange={(tech) => setProject(project.id, { tech })} />
            <Field
              label="Description"
              value={project.description}
              onChange={(description) => setProject(project.id, { description })}
              multiline
            />
          </ItemCard>
        ))}
        <AddButton
          label="Add one more project"
          onClick={() =>
            onChange({
              projects: [
                ...(resume.projects || []),
                { id: `proj-${Date.now()}`, name: '', tech: '', description: '' },
              ],
            })
          }
        />
      </Section>

      <Section title="Education">
        {(resume.education || []).map((school, index) => (
          <ItemCard
            key={school.id}
            title={[school.degree, school.details].filter(Boolean).join(' / ') || 'Education'}
            index={index}
            onReorder={(from, to) => onChange({ education: moveItem(resume.education || [], from, to) })}
            onRemove={() => onChange({ education: resume.education.filter((item) => item.id !== school.id) })}
          >
            <Field label="Degree" value={school.degree} onChange={(degree) => setEducation(school.id, { degree })} />
            <Field label="Field" value={school.details} onChange={(details) => setEducation(school.id, { details })} />
          </ItemCard>
        ))}
        <AddButton
          label="Add one more"
          onClick={() =>
            onChange({
              education: [...(resume.education || []), { id: `edu-${Date.now()}`, degree: '', details: '' }],
            })
          }
        />
      </Section>

      <Section title="Extra Context" hint="Anything not on the CV. Career changes, gaps, or facts you want answers to use.">
        <Field
          label="Additional information"
          value={resume.extraContext}
          onChange={(extraContext) => onChange({ extraContext })}
          multiline
          placeholder="e.g. I'm moving from manual testing into automation."
        />
      </Section>

      <button
        type="button"
        className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs"
        onClick={() => setConfirmRemove(true)}
      >
        <AppIcon icon={Trash2} size={14} />
        Remove this resume
      </button>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this resume?"
        description={`"${resumeTitle(resume)}" and everything extracted from it will be deleted from this device. This cannot be undone.`}
        confirmLabel="Remove resume"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false)
          onDelete()
        }}
      />
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-[12px] font-medium text-zinc-200">{title}</h3>
        {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * Resume editor field. Keeps a local draft and commits (one store write of the resume library) when you
 * pause typing, press Enter in a single-line field, or leave the field. It used to write per keystroke.
 */
function Field({ label, value, onChange, multiline = false, placeholder = '' }) {
  const className = 'input-shadow mt-1 w-full px-3 py-2 text-[13px]'
  const draft = useDraftSetting(value || '', onChange, { delay: 500 })
  return (
    <label className="block text-[11px] text-zinc-500">
      {label}
      {multiline ? (
        <textarea placeholder={placeholder} rows={4} className={className} {...draft.inputProps} />
      ) : (
        <input placeholder={placeholder} className={className} {...draft.inputProps} />
      )}
    </label>
  )
}

function ItemCard({ title, secondary, index, onReorder, onRemove, children }) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)

  return (
    <div
      className={`rounded-lg border border-white/10 ${over ? 'border-zinc-400/40 bg-white/[0.03]' : ''} ${dragging ? 'opacity-50' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const from = Number(event.dataTransfer.getData('text/plain'))
        if (!Number.isFinite(from) || from === index) return
        onReorder?.(from, index)
      }}
    >
      <div className="flex w-full items-center gap-1 px-1 py-1.5">
        <button
          type="button"
          className="inline-flex min-h-[24px] min-w-[24px] cursor-grab items-center justify-center px-1.5 py-1 text-zinc-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', String(index))
            event.dataTransfer.effectAllowed = 'move'
            setDragging(true)
          }}
          onDragEnd={() => {
            setDragging(false)
            setOver(false)
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <AppIcon icon={GripVertical} size={14} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left" onClick={() => setOpen((value) => !value)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-zinc-100">{title}</span>
            {secondary ? <span className="block truncate text-[11px] text-zinc-500">{secondary}</span> : null}
          </span>
          <AppIcon icon={ChevronDown} size={14} className={open ? 'rotate-180 text-zinc-400' : 'text-zinc-500'} />
        </button>
      </div>
      {open ? (
        <div className="space-y-2 border-t border-white/10 px-3 py-2">
          {children}
          <button type="button" className="text-[11px] text-zinc-500" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AddButton({ label, onClick }) {
  return (
    <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={onClick}>
      + {label}
    </button>
  )
}
