/*
 * The eclipses either side of a moment, from Astronomy Engine's searches. A
 * solar eclipse is the Moon's shadow on the Earth; a lunar one is the Earth's
 * shadow on the Moon.
 */

import { EclipseKind, NextGlobalSolarEclipse, NextLunarEclipse, SearchGlobalSolarEclipse, SearchLunarEclipse } from 'astronomy-engine'
import { TIME_MAX, TIME_MIN } from './ephemeris'

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

const DAY_MS = 86_400_000

/** Within three hours of its peak the clock is at an eclipse, rather than between two. */
export const NEAR_MS = 3 * 3_600_000

/**
 * Whether peak `a` is before, the same as or after peak `b`, as -1, 0 or 1. A
 * peak found twice can differ by milliseconds with where the search began, so
 * two within a minute are the same.
 */
function compare(a: number, b: number): number {
  return Math.abs(a - b) < 60_000 ? 0 : Math.sign(a - b)
}

/** The first eclipse of a type whose peak is after `ms`. */
export function nextEclipse(type: EclipseType, ms: number): Eclipse {
  // The searches go from moon to moon, and a peak can come up to twenty
  // minutes after its new or full moon, so starting just before a peak would
  // pass it by. They start a day early.
  const from = new Date(ms - DAY_MS)
  if (type === 'solar') {
    let e = SearchGlobalSolarEclipse(from)
    while (compare(e.peak.date.getTime(), ms) <= 0) e = NextGlobalSolarEclipse(e.peak)
    const where = e.latitude !== undefined && e.longitude !== undefined ? { lat: e.latitude, lon: e.longitude } : undefined
    return { type, kind: KIND[e.kind], peak: e.peak.date.getTime(), where }
  }
  let e = SearchLunarEclipse(from)
  while (compare(e.peak.date.getTime(), ms) <= 0) e = NextLunarEclipse(e.peak)
  return { type, kind: KIND[e.kind], peak: e.peak.date.getTime() }
}

/** The last eclipse of a type whose peak is before `ms`. The searches only run forward, so this starts back and walks up. */
export function previousEclipse(type: EclipseType, ms: number): Eclipse {
  // Two of a kind are never much more than half a year apart.
  let from = ms
  let e: Eclipse
  do {
    from -= 200 * DAY_MS
    e = nextEclipse(type, from)
  } while (compare(e.peak, ms) >= 0)
  for (let n = nextEclipse(type, e.peak); compare(n.peak, ms) < 0; n = nextEclipse(type, n.peak)) e = n
  return e
}

const ends: Partial<Record<EclipseType, [number, number]>> = {}

/** The peaks of the first and the last eclipse of a type in the clock's range, found the first time they are asked for. */
function rangeOf(type: EclipseType): [number, number] {
  return (ends[type] ??= [nextEclipse(type, TIME_MIN).peak, previousEclipse(type, TIME_MAX).peak])
}

/** The eclipse of a type the clock is at, or else the next to come. */
export function nearEclipse(type: EclipseType, ms: number): Eclipse {
  return nextEclipse(type, ms - NEAR_MS)
}

/** One type of eclipse as the clock stands among them. */
export interface EclipseSteps {
  /** The one it is at or coming to. Null past the end of the clock's range, or if the search failed. */
  e: Eclipse | null
  at: boolean
  /** Whether there is one in the clock's range to step back to, and one to step on to. */
  back: boolean
  on: boolean
}

/** Where stepping can go from `e`, what `nearEclipse` found for `ms`, without searching again. */
export function stepsFrom(e: Eclipse, ms: number): EclipseSteps {
  const [first, last] = rangeOf(e.type)
  const at = Math.abs(ms - e.peak) < NEAR_MS
  const toLast = compare(e.peak, last)
  return { e: toLast <= 0 ? e : null, at, back: compare(e.peak, first) > 0, on: at ? toLast < 0 : toLast <= 0 }
}

/**
 * Where a step goes from `ms`: from an eclipse the clock is at, the one
 * before or after it; from between two, the one before or the next. Null
 * past either end of the clock's range.
 */
export function stepTo(type: EclipseType, ms: number, way: 1 | -1): Eclipse | null {
  const e = nearEclipse(type, ms)
  const to = way < 0 ? previousEclipse(type, e.peak) : Math.abs(ms - e.peak) < NEAR_MS ? nextEclipse(type, e.peak) : e
  const [first, last] = rangeOf(type)
  return compare(to.peak, first) >= 0 && compare(to.peak, last) <= 0 ? to : null
}

/** Every eclipse, of both types, with its peak from `from` up to `to`, in order. */
export function eclipsesBetween(from: number, to: number): Eclipse[] {
  const found: Eclipse[] = []
  for (const type of ['solar', 'lunar'] as const) {
    for (let e = nextEclipse(type, from - 1); e.peak < to; e = nextEclipse(type, e.peak)) found.push(e)
  }
  return found.sort((a, b) => a.peak - b.peak)
}
