// Copyright (c) 2026 ShadowAssist. All rights reserved.
// Unauthorized copying or distribution is prohibited.

import React, { useState, useRef, useEffect, memo, forwardRef, useImperativeHandle } from 'react'
import { ArrowUp } from 'lucide-react'
import AppIcon from '../../shared/AppIcon'

function InputBarInner({ onAsk, onAbort, isThinking, sessionOn = false, focusMode = false }, ref) {
  const [value, setValue] = useState('')
  const [nudge, setNudge] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimerRef = useRef(null)
  const textRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus() {
      textRef.current?.focus()
    },
  }))

  const placeholder = sessionOn ? 'type here' : 'Start listening to ask a question'

  useEffect(() => () => clearTimeout(noticeTimerRef.current), [])

  /** The ask was rejected (answer still streaming / too soon): keep the text and say why. */
  const flagRejected = () => {
    setNudge(true)
    setNotice(isThinking ? 'Still answering — your text is kept. Press Enter again when it finishes.' : 'One moment — your text is kept. Press Enter again.')
    clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(''), 3000)
  }

  const submitText = () => {
    if (!sessionOn) return
    const trimmed = value.trim()
    if (trimmed) {
      // handleAsk returns false when it silently rejected the request; only an accepted ask clears the box.
      const accepted = onAsk(trimmed, { source: 'typed', bypassCaptureCooldown: true })
      if (accepted === false) flagRejected()
      else setValue('')
    } else {
      onAsk(null, { source: 'screen-read', bypassCaptureCooldown: true })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitText()
    }
    if (e.key === 'Escape' && focusMode) {
      setValue('')
      textRef.current?.blur()
    }
  }

  return (
    <div className="flex shrink-0 items-end gap-2 px-3 py-2.5">
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Ask a question"
        rows={1}
        disabled={!sessionOn}
        className={[
          'crystal-input flex-1 min-h-[34px] max-h-[72px] resize-none rounded-xl px-3 py-2',
          'text-[12.5px] transition-colors duration-150',
          'disabled:opacity-45 disabled:cursor-not-allowed',
          nudge ? 'crystal-input-nudge' : '',
        ].join(' ')}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onAnimationEnd={() => setNudge(false)}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {notice}
      </span>
      {isThinking && !value.trim() ? (
        <button
          type="button"
          onClick={() => onAbort?.()}
          aria-label="Stop generating"
          className="crystal-stop-btn cursor-default flex h-[34px] shrink-0 items-center justify-center rounded-xl px-3 text-[11px] font-medium transition-colors duration-150 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={submitText}
          disabled={!sessionOn || (isThinking && !value.trim())}
          aria-label="Send"
          className={[
            'crystal-send-btn cursor-default flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition duration-150 active:scale-95',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
            isThinking && !value.trim() ? 'opacity-50' : '',
          ].join(' ')}
        >
          <AppIcon icon={ArrowUp} size={16} strokeWidth={2.25} className="text-white" />
        </button>
      )}
    </div>
  )
}

const InputBar = memo(forwardRef(InputBarInner))
export default InputBar
