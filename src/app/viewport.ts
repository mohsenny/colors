import {
  FRAME_PX,
  FRAME_PX_SMALL,
  SLIDE_COUNT,
  SLIDE_COUNT_SMALL,
  SMALL_VIEWPORT,
} from '../core/constants'
import type { Viewport } from '../core/types'

/**
 * Viewport metrics are derived in exactly one place so the simulation, the
 * renderer and the interaction layer can never disagree about what a unit is.
 */
export function measureViewport(el: HTMLElement): Viewport {
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
    slideCount: small ? SLIDE_COUNT_SMALL : SLIDE_COUNT,
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
