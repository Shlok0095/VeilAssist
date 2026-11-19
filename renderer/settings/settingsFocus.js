// Copyright (c) 2026 VeilAssist. All rights reserved.
// DOM helper for search results and deep links: open the collapsibles around an anchored row,
// scroll it into view, move keyboard focus to its control and flash it briefly.

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="switch"]:not([disabled]),[role="radio"],a[href]'

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
  } catch {
    return false
  }
}

/**
 * @param {ParentNode} root  the scroll container
 * @param {string} section   anchor id (data-settings-anchor)
 * @returns {boolean} whether the anchor was found
 */
export function focusSettingsAnchor(root, section) {
  if (!root || !section) return false
  const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(section) : String(section).replace(/"/g, '\\"')
  const el = root.querySelector(`[data-settings-anchor="${safe}"]`)
  if (!el) return false

  // A closed <details> hides its rows; open every collapsible between the root and the anchor.
  let details = el.closest('details')
  while (details) {
    if (!details.open) details.open = true
    details = details.parentElement ? details.parentElement.closest('details') : null
  }

  el.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })

  let target = null
  if (el.matches('details')) target = el.querySelector('summary')
  else if (el.matches(FOCUSABLE_SELECTOR)) target = el
  else target = el.querySelector(FOCUSABLE_SELECTOR)
  if (!target) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    target = el
  }
  try {
    target.focus({ preventScroll: true })
  } catch {
    /* detached */
  }

  el.classList.add('settings-anchor-flash')
  window.setTimeout(() => el.classList.remove('settings-anchor-flash'), 1800)
  return true
}
