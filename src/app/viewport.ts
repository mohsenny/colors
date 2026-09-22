import {
  FRAME_PX,
  FRAME_PX_SMALL,
  SLIDE_COUNT,
  SLIDE_COUNT_MAX,
  SLIDE_COUNT_MIN,
  SLIDE_COUNT_SMALL,
  SMALL_VIEWPORT,
} from '../core/constants'
import type { Viewport } from '../core/types'

/**
 * How many slides this viewport will carry by itself, before anyone asks for a
 * different number. Exported so the count control can show the user what it is
 * going back to when they clear their choice.
 */
export function defaultSlideCount(short: number): number {
  return short < SMALL_VIEWPORT ? SLIDE_COUNT_SMALL : SLIDE_COUNT
}

/**
 * Viewport metrics are derived in exactly one place so the simulation, the
 * renderer and the interaction layer can never disagree about what a unit is.
 *
 * `countOverride` is the user's choice from the options panel, and null means
 * they have not made one. It goes through the same clamp as everything else
 * here rather than being applied downstream, because slide count is a viewport
 * fact: every consumer already reacts to it changing.
 */
export function measureViewport(el: HTMLElement, countOverride: number | null = null): Viewport {
  const rect = el.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const short = Math.min(width, height)
  const small = short < SMALL_VIEWPORT
  return {
    width,
    height,
    short,
    aspect: width / height,
    frame: small ? FRAME_PX_SMALL : FRAME_PX,
    slideCount:
      countOverride === null
        ? defaultSlideCount(short)
        : Math.round(Math.min(SLIDE_COUNT_MAX, Math.max(SLIDE_COUNT_MIN, countOverride))),
  }
}

export function viewportChanged(a: Viewport, b: Viewport): boolean {
  return (
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5 ||
    a.slideCount !== b.slideCount
  )
}

/** Below 2% in both aspect and short side, a resize is not worth a reflow. */
export function viewportSignificant(a: Viewport, b: Viewport): boolean {
  if (a.slideCount !== b.slideCount) return true
  return Math.abs(b.aspect - a.aspect) / a.aspect > 0.02 || Math.abs(b.short - a.short) / a.short > 0.02
}
