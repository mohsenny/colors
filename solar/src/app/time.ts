/*
 * How fast the clock runs, and how it reads. At true scale nothing visibly
 * moves at twice or a hundred times real speed, so the speed knob rests on
 * real time in the middle and, turned either way, starts at a minute a
 * second (the Moon crosses its own width) and climbs evenly through the
 * units things move in to a year a second at the end. Right runs the clock
 * forward, left back.
 */

const MIN = 60
const HOUR = 3600
const DAY = 86_400
const MONTH = 30.436875 * DAY
const YEAR = 365.2425 * DAY

/** How far either side of the middle the knob still reads real time. */
export const DEAD = 0.06

/** Simulated seconds per real second with the knob turned to `dial`, -1 to 1: below 0 the clock runs back. */
export function rateOf(dial: number): number {
  const a = Math.min(1, Math.abs(dial))
  if (a < DEAD) return 1
  return Math.sign(dial) * MIN * (YEAR / MIN) ** ((a - DEAD) / (1 - DEAD))
}

/** Where the knob gives a speed: `rateOf` the other way. */
export function dialOf(rate: number): number {
  const a = Math.abs(rate)
  if (a < MIN) return 0
  if (a >= YEAR) return Math.sign(rate)
  return Math.sign(rate) * (DEAD + ((1 - DEAD) * Math.log(a / MIN)) / Math.log(YEAR / MIN))
}

/** The round speeds a step of the knob stops at, each way. */
const ROUND = [MIN, 10 * MIN, HOUR, 6 * HOUR, DAY, 7 * DAY, MONTH, YEAR]
const NOTCHES = [...ROUND.map((r) => dialOf(-r)).reverse(), 0, ...ROUND.map(dialOf)]

/** The next round speed from `dial`, up the knob or down it. */
export function notch(dial: number, way: 1 | -1): number {
  const next = way > 0 ? NOTCHES.find((n) => n > dial + 1e-9) : [...NOTCHES].reverse().find((n) => n < dial - 1e-9)
  return next ?? way
}

const UNITS: ReadonlyArray<[number, string, string]> = [
  [YEAR, 'yr', 'year'],
  [MONTH, 'mo', 'month'],
  [7 * DAY, 'wk', 'week'],
  [DAY, 'day', 'day'],
  [HOUR, 'hr', 'hour'],
  [MIN, 'min', 'minute'],
]

/** The speed in two figures, in the biggest unit it fills, so it never reads 60 min/s. Null at real time. */
function reading(rate: number): [number, string, string] | null {
  const a = Math.abs(rate)
  if (a < MIN) return null
  for (const [size, short, long] of UNITS) {
    const q = a / size
    const n = q < 10 ? Math.round(q * 10) / 10 : Math.round(q)
    if (n >= 1) return [n, short, long]
  }
  return null
}

/** The speed as the knob shows it: "Real time", "+10 min/s", "−2.5 day/s". */
export function speedLabel(dial: number): string {
  const rate = rateOf(dial)
  const r = reading(rate)
  return r ? `${rate < 0 ? '−' : '+'}${r[0]} ${r[1]}/s` : 'Real time'
}

/** The same in words: "Real time", "10 minutes a second", "1 day a second, backward". */
export function speedSaid(dial: number): string {
  const rate = rateOf(dial)
  const r = reading(rate)
  if (!r) return 'Real time'
  return `${r[0]} ${r[2]}${r[0] === 1 ? '' : 's'} a second${rate < 0 ? ', backward' : ''}`
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
