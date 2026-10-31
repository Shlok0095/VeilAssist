// Copyright (c) 2026 VeilAssist. Profile settings — modes and interview resumes.

import React from 'react'
import { LayoutTemplate } from 'lucide-react'
import { SettingsCollapsible, SettingsPage } from './SettingsComponents'
import ProfileModesPanel from './ProfileModesPanel'
import InterviewResumesSection from './InterviewResumesSection'
import { GeneralPurposeSection, MeetingMaterialsSection } from './ModeMaterialsSection'

export default function ProfileSettingsPanel({ profilePanel = {} }) {
  const panel = profilePanel
  const modeId = panel.activeContextPromptId
  const interview = modeId === 'mode-interview'
  const meeting = modeId === 'mode-meeting'
  const general = modeId === 'mode-general'

  return (
    <SettingsPage
      title="Profile"
      description="Interview uses a resume. Meeting and General use a prompt and a structured document."
      wide
    >
      <SettingsCollapsible
        title="Modes"
        description="Interview: select a resume. Meeting and General: write a prompt and select a document."
        icon={LayoutTemplate}
        defaultOpen
      >
        <div className="space-y-5 px-1 pb-1">
          <ProfileModesPanel
            activeContextPromptId={panel.activeContextPromptId}
            onSelectPrompt={panel.onSelectPrompt}
          />
          {interview ? (
            <InterviewResumesSection
              resumes={panel.resumeLibrary}
              activeResumeId={panel.activeResumeId}
              busy={panel.resumeBusy}
              error={panel.resumeError}
              onUpload={panel.onUploadResume}
              onSelect={panel.onSelectResume}
              onChange={panel.onChangeResumes}
              onDelete={panel.onDeleteResume}
            />
          ) : null}
          {meeting ? (
            <MeetingMaterialsSection
              prompt={panel.meetingPrompt}
              documents={panel.meetingDocuments}
              activeDocumentId={panel.activeMeetingDocumentId}
              busy={panel.documentBusy}
              error={panel.documentError}
              onPromptChange={panel.onMeetingPromptChange}
              onUpload={panel.onUploadMeetingDocument}
              onSelect={panel.onSelectMeetingDocument}
              onChange={panel.onChangeMeetingDocuments}
              onDelete={panel.onDeleteMeetingDocument}
            />
          ) : null}
          {general ? (
            <GeneralPurposeSection
              purposes={panel.generalPurposes}
              activePurposeId={panel.activeGeneralPurposeId}
              busy={panel.documentBusy}
              error={panel.documentError}
              onCreate={panel.onCreatePurpose}
              onUpload={panel.onUploadPurposeDocument}
              onSelect={panel.onSelectPurpose}
              onChange={panel.onChangePurpose}
              onDelete={panel.onDeletePurpose}
            />
          ) : null}
        </div>
      </SettingsCollapsible>
    </SettingsPage>
  )
}
