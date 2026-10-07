import { useEffect } from 'react'

/** Quiet time before the words and controls leave the screen. */
const IDLE_MS = 3000

/** Chrome a resting mouse, or the keys working in it, holds up. */
const HELD = ':is(.lb-dock, .lb-tray, .lb-title, .lb-tab, .lb-grip, .cv-ways)'

/** The mark on the root while the page is idle. */
const IDLE = 'is-idle'

/**
 * Chrome that stays on screen while the page is idle, like the CV's card. It
 * never left, so a press on it is meant for it and wakes nothing.
 */
const AWAKE = '[data-awake]'

/*
 * What the hand is doing. It lives out here because the effect below starts
 * again each time a drawer opens or closes, and the hand has not changed.
 */

/** A finger leaves :hover on whatever it touched last, so only a mouse rests. */
let mouse = true
/** Focus the keys put there, with Tab. A click leaves focus on its button too, and that holds nothing. */
let keys = false
/** Pointers down now. Any of them holds the chrome up. */
const pressed = new Set<number>()
/** Pointers down now that only woke the page. Nothing under them hears of them. */
const waking = new Set<number>()
/** A waking press has ended, and its click may be still to come. */
let click = false
/** The last click to start a count was a waking press's, so the double-click it makes goes too. */
let pair = false

/** Whether the page is idle, for what a stylesheet cannot reach: lines drawn on a canvas. */
export function isIdle(): boolean {
  return document.documentElement.classList.contains(IDLE)
}

/**
 * Whether a press only wakes the page and reaches nothing under it: a finger
 * or a pen, while the page is idle or another such press is down, anywhere but
 * on chrome that never left.
 */
export function onlyWakes(pointerType: string, target: EventTarget | null, idle: boolean, waking: number): boolean {
  if (pointerType === 'mouse' || (!idle && waking === 0)) return false
  // Duck-typed rather than `instanceof Element`, so the rule runs outside a page too.
  const el = target as { closest?: (selectors: string) => unknown } | null
  return !el?.closest?.(AWAKE)
}

/**
 * Idle, shared by every page: after a while without the mouse, a touch or a
 * key, or as soon as the window is left for another, every word and control
 * leaves the screen and the cursor goes with them, playing or not, until the
 * hand comes back. Not while `busy` (a drawer is open), nor while a pointer is
 * down, the mouse rests on the chrome or the keys have tabbed into it. The
 * mark is a class on the root, as the chrome is all over the page: the tabs on
 * the mounts and the names in the sky are words too.
 *
 * A finger or a pen that comes down on an idle page only brings the chrome
 * back. Its press, and any other finger's while it is down, reach nothing
 * under it, click included, unless it lands inside `[data-awake]`. A mouse
 * wakes the page as it moves, so its presses always act.
 */
export function useIdle(busy: boolean): void {
  useEffect(() => {
    const root = document.documentElement
    let idle = false
    let timer = 0
    const mark = (on: boolean): void => {
      if (on !== idle) root.classList.toggle(IDLE, (idle = on))
    }
    const rest = (): void => {
      window.clearTimeout(timer)
      if (!busy) mark(true)
    }
    const arm = (): void => {
      window.clearTimeout(timer)
      if (busy) return
      timer = window.setTimeout(() => {
        const held =
          pressed.size > 0 ||
          (mouse && document.querySelector(`${HELD}:hover`)) ||
          (keys && document.querySelector(`${HELD} :focus-visible`))
        if (!held) mark(true)
      }, IDLE_MS)
    }
    const wake = (): void => {
      mark(false)
      arm()
    }
    const hush = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    const down = (e: PointerEvent): void => {
      mouse = e.pointerType === 'mouse'
      keys = false
      click = false
      // The first of its kind down, so any other still listed lost its pointerup.
      if (e.isPrimary) {
        pressed.clear()
        waking.clear()
      }
      pressed.add(e.pointerId)
      if (onlyWakes(e.pointerType, e.target, idle, waking.size)) {
        waking.add(e.pointerId)
        hush(e)
      }
      wake()
    }
    const move = (e: PointerEvent): void => {
      mouse = e.pointerType === 'mouse'
      // Nothing pressed, so its pointerup was lost, say to a menu.
      if (e.buttons === 0) {
        pressed.delete(e.pointerId)
        waking.delete(e.pointerId)
      }
      if (waking.has(e.pointerId)) hush(e)
      wake()
    }
    const up = (e: PointerEvent): void => {
      pressed.delete(e.pointerId)
      if (waking.has(e.pointerId)) {
        hush(e)
        click = true
        // WebKit can cancel a press, then lift it and click all the same.
        if (e.type === 'pointerup') waking.delete(e.pointerId)
      }
      wake()
    }
    const clicked = (e: MouseEvent): void => {
      // A key's click has no count and a script's is not trusted. Neither is a press.
      if (!e.isTrusted || e.detail === 0) return
      if (e.detail === 1) pair = click
      if (click) {
        click = false
        hush(e)
      }
    }
    const doubled = (e: MouseEvent): void => {
      if (pair) hush(e)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') keys = true
      wake()
    }
    const off = new AbortController()
    const { signal } = off
    // `focus` and `pageshow` are the window's own: back from another window, or from history.
    for (const ev of ['wheel', 'focus', 'pageshow'] as const) window.addEventListener(ev, wake, { passive: true, signal })
    window.addEventListener('blur', rest, { signal })
    // On the way down, so before the canvases and the stage, which stop some of these.
    const first = { capture: true, signal }
    window.addEventListener('pointerdown', down, first)
    window.addEventListener('pointermove', move, first)
    window.addEventListener('pointerup', up, first)
    window.addEventListener('pointercancel', up, first)
    window.addEventListener('click', clicked, first)
    window.addEventListener('dblclick', doubled, first)
    window.addEventListener('keydown', key, first)
    arm()
    return () => {
      window.clearTimeout(timer)
      off.abort()
      mark(false)
    }
  }, [busy])
}
