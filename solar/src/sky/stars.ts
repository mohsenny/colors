/*
 * The Yale Bright Star Catalogue, every star down to about magnitude 6.5,
 * which is all the naked eye gets on a dark night. Packed six bytes a star:
 * right ascension over a full turn as u16, declination over a half turn as
 * i16, then V magnitude and B-V colour index as a byte each. Brightest first.
 */

import { toEcliptic } from './ephemeris'

export interface Stars {
  count: number
  /** Unit directions in the ecliptic frame, three floats a star. */
  dir: Float32Array
  /** Visual magnitude. */
  mag: Float32Array
  /** B-V colour index: blue under zero, the Sun at 0.65, red over 1.5. */
  bv: Float32Array
}

export function unpackStars(buf: ArrayBuffer): Stars {
  const view = new DataView(buf)
  const count = Math.floor(buf.byteLength / 6)
  const dir = new Float32Array(count * 3)
  const mag = new Float32Array(count)
  const bv = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const o = i * 6
    const ra = (view.getUint16(o, true) / 65535) * 2 * Math.PI
    const dec = (view.getInt16(o + 2, true) / 32767) * (Math.PI / 2)
    const c = Math.cos(dec)
    dir.set(toEcliptic(c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)), i * 3)
    mag[i] = (view.getUint8(o + 4) - 40) / 20
    bv[i] = (view.getUint8(o + 5) - 64) / 50
  }
  return { count, dir, mag, bv }
}
