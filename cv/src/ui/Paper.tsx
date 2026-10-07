import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { shadowStack } from '../../../src/render/shadow'
import { PAPER_ID } from '../text'

/** Lightbox lays its paper at the middle of the depth range, and this is the same card. */
const PAPER_Z = 0.5

/** A press on these is not a press away from the paper: the paper, and the dock that holds its button. */
const NOT_AWAY = `#${PAPER_ID}, .lb-dock`

/**
 * The text CV on Lightbox's paper. The paper is in index.html already,
 * written there by text.ts at build time, so it reads before this script
 * runs and without it. This only takes it in, so it stacks with the rest of
 * the page, and slides it out or back. A press anywhere off it puts it away,
 * and scrolled past the name, its bar comes down with the name and the four
 * ways in it.
 */
export function Paper({ open, onClose }: { open: boolean; onClose?: () => void }): ReactElement {
  const slot = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const paper = document.getElementById(PAPER_ID)
    const at = slot.current
    if (!paper || !at) return
    const home = paper.parentNode
    const next = paper.nextSibling
    at.append(paper)
    paper.style.boxShadow = shadowStack(PAPER_Z)
    // The index jumps down the paper. The hash is the app's, read when the
    // page opens, so a jump scrolls without writing it.
    const jump = (e: MouseEvent): void => {
      const href = e.target instanceof Element ? e.target.closest('a')?.getAttribute('href') : null
      const to = href?.startsWith('#cv-') ? paper.querySelector<HTMLElement>(href) : null
      if (!to) return
      e.preventDefault()
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      to.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
      to.focus({ preventScroll: true })
    }
    paper.addEventListener('click', jump)
    // The bar comes down once the ways under the name have scrolled up out of
    // sight, and goes when they are back.
    const text = paper.querySelector('.cv-text')
    const ways = paper.querySelector('.cv-hero .cv-reach')
    let watch: IntersectionObserver | null = null
    if (text && ways) {
      watch = new IntersectionObserver(
        ([e]) => paper.classList.toggle('is-past', !!e && !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0)),
        { root: text },
      )
      watch.observe(ways)
    }
    // Back where it was found, so the development double mount finds it again.
    return () => {
      paper.removeEventListener('click', jump)
      watch?.disconnect()
      paper.classList.remove('is-past')
      home?.insertBefore(paper, next)
    }
  }, [])

  // Pressed, not clicked: a selection in the paper let go off it is still reading.
  useEffect(() => {
    if (!open || !onClose) return
    const away = (e: PointerEvent): void => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest(NOT_AWAY))) return
      onClose()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open, onClose])

  const first = useRef(true)
  // What had focus when the paper came out, to have it back when the paper
  // goes, if focus was in the paper by then: hidden, it can hold none.
  const opener = useRef<Element | null>(null)
  useLayoutEffect(() => {
    const paper = document.getElementById(PAPER_ID)
    if (!paper) return
    if (open) {
      opener.current = document.activeElement
    } else if (paper.contains(document.activeElement)) {
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus()
      else (document.activeElement as HTMLElement | null)?.blur()
    }
    // The page opens on the life with no paper leaving: the first close is a cut.
    const cut = first.current && !open
    first.current = false
    if (cut) paper.style.transition = 'none'
    paper.classList.toggle('is-in', open)
    if (cut) {
      void paper.offsetWidth
      paper.style.transition = ''
    }
  }, [open])

  return <div ref={slot} className="cv-slot" />
}
