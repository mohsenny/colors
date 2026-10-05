/*
 * The next eclipse of each kind after a moment, from Astronomy Engine's
 * searches. A solar eclipse is the Moon's shadow on the Earth; a lunar one is
 * the Earth's shadow on the Moon.
 */

import { EclipseKind, NextGlobalSolarEclipse, NextLunarEclipse, SearchGlobalSolarEclipse, SearchLunarEclipse } from 'astronomy-engine'

export type EclipseType = 'solar' | 'lunar'

export interface Eclipse {
  type: EclipseType
  /** Total, annular, partial or penumbral. */
  kind: string
  /** The moment of greatest eclipse, UTC ms. */
  peak: number
  /** Where the shadow's axis comes closest to the Earth's centre, for a solar one. */
  where?: { lat: number; lon: number }
}

const KIND: Record<EclipseKind, string> = {
  [EclipseKind.Penumbral]: 'Penumbral',
  [EclipseKind.Partial]: 'Partial',
  [EclipseKind.Annular]: 'Annular',
  [EclipseKind.Total]: 'Total',
}

/** The first eclipse of a type whose peak is after `ms`. */
export function nextEclipse(type: EclipseType, ms: number): Eclipse {
  const from = new Date(ms)
  if (type === 'solar') {
    let e = SearchGlobalSolarEclipse(from)
    while (e.peak.date.getTime() <= ms) e = NextGlobalSolarEclipse(e.peak)
    const where = e.latitude !== undefined && e.longitude !== undefined ? { lat: e.latitude, lon: e.longitude } : undefined
    return { type, kind: KIND[e.kind], peak: e.peak.date.getTime(), where }
  }
  let e = SearchLunarEclipse(from)
  while (e.peak.date.getTime() <= ms) e = NextLunarEclipse(e.peak)
  return { type, kind: KIND[e.kind], peak: e.peak.date.getTime() }
}
