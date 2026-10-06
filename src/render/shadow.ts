import { H_MM_BASE, H_MM_RANGE } from '../core/constants'
import type { Shade } from './photo'

/*
 * How high a card stands off the lit surface, as the shadows it casts. Out of
 * stage.ts so the CV's mounts stand at the same heights as Lightbox's without
 * pulling in the stage.
 */

/** Shadow model (design notes 1.5). Alpha falls as blur grows; that inversion
 *  is what reads as a physical object a few millimetres above a lit surface. */
const SOFT_BLUR_BASE = 3
const SOFT_BLUR_PER_MM = 4
const SOFT_OY_PER_MM = 1.6
const CONTACT_BLUR_BASE = 1.5
const CONTACT_BLUR_PER_MM = 0.6
const CONTACT_OY_PER_MM = 0.4
const OX_OVER_OY = 0.35
const SOFT_ALPHA_BASE = 0.155
const SOFT_ALPHA_PER_MM = 0.0105
const CONTACT_ALPHA_BASE = 0.1
const CONTACT_ALPHA_PER_MM = 0.008
export const LIP = 'rgba(30,34,48,0.055)'
const OUTER_LIP = `0 0 0 0.5px ${LIP}`

/*
 * Height only. Selection used to add a 1px ring here, which was a second
 * border a hair outside the card's own: a box-shadow spread follows the border
 * box, so it stopped where the mount stopped and cut straight across the base
 * of the tab. Selection now darkens the card's one real edge instead, in CSS,
 * and that line already goes round the tab.
 */
export function shadowStack(z: number): string {
  const [contact, soft] = shadowParts(z)
  const css = (s: Shade): string =>
    `${s.ox.toFixed(2)}px ${s.oy.toFixed(2)}px ${s.blur.toFixed(2)}px rgba(46,52,72,${s.alpha.toFixed(4)})`
  return `${OUTER_LIP}, ${css(soft)}, ${css(contact)}`
}

/** The two shadows of a card at height `z`, the contact under the soft, as numbers for the photograph. */
export function shadowParts(z: number): [Shade, Shade] {
  const hmm = H_MM_BASE + H_MM_RANGE * z
  const softOy = SOFT_OY_PER_MM * hmm
  const contactOy = CONTACT_OY_PER_MM * hmm
  return [
    {
      ox: contactOy * OX_OVER_OY,
      oy: contactOy,
      blur: CONTACT_BLUR_BASE + CONTACT_BLUR_PER_MM * hmm,
      alpha: Math.max(0, CONTACT_ALPHA_BASE - CONTACT_ALPHA_PER_MM * hmm),
    },
    {
      ox: softOy * OX_OVER_OY,
      oy: softOy,
      blur: SOFT_BLUR_BASE + SOFT_BLUR_PER_MM * hmm,
      alpha: Math.max(0, SOFT_ALPHA_BASE - SOFT_ALPHA_PER_MM * hmm),
    },
  ]
}
