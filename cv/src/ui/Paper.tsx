import { useLayoutEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { shadowStack } from '../../../src/render/shadow'
import { PAPER_ID } from '../text'

/** Lightbox lays its paper at the middle of the depth range, and this is the same card. */
const PAPER_Z = 0.5

/**
 * The text CV on Lightbox's paper. The paper is in index.html already,
 * written there by text.ts at build time, so it reads before this script
 * runs and without it. This only takes it in, so it stacks with the rest of
 * the page, and slides it out or back.
 */
export function Paper({ open }: { open: boolean }): ReactElement {
  const slot = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const paper = document.getElementById(PAPER_ID)
    const at = slot.current
    if (!paper || !at) return
    const home = paper.parentNode
    const next = paper.nextSibling
    at.append(paper)
    paper.style.boxShadow = shadowStack(PAPER_Z)
    // Back where it was found, so the development double mount finds it again.
    return () => {
      home?.insertBefore(paper, next)
    }
  }, [])

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
