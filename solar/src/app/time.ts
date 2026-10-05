/*
 * How fast the clock runs, and how it reads. At true scale nothing visibly
 * moves at twice or a hundred times real speed, so the ladder climbs in the
 * units things move in: the Moon crosses its own width in an hour, the
 * Earth turns in a day, the planets wheel round in months and years.
 */

const MIN = 60
const HOUR = 3600
const DAY = 86_400

/** Simulated seconds per real second, a rung of the ladder each. */
export const RATES: readonly number[] = [1, MIN, 10 * MIN, HOUR, 6 * HOUR, DAY, 7 * DAY, 30.436875 * DAY, 365.2425 * DAY]

const NAMES: readonly string[] = ['Real time', '1 min/s', '10 min/s', '1 hr/s', '6 hr/s', '1 day/s', '1 wk/s', '1 mo/s', '1 yr/s']

/** The highest rung, each way. Rung 0 is real time; below it the same speeds run backward. */
export const TOP = RATES.length - 1

export function clampRung(rung: number): number {
  return Math.max(-TOP, Math.min(TOP, Math.round(rung)))
}

/** Simulated seconds per real second at a rung: negative runs the clock back. */
export function rateOf(rung: number): number {
  const r = clampRung(rung)
  return r < 0 ? -RATES[-r] : RATES[r]
}

export function rateName(rung: number): string {
  return NAMES[Math.abs(clampRung(rung))]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function two(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** "5 Oct 2026", in UTC. */
export function dayLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "14:32:07", in UTC. */
export function clockLabel(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
}

/** "14:32", in UTC. */
export function minuteLabel(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}
