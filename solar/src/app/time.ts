/*
 * How fast the clock runs, and how it reads. At true scale nothing visibly
 * moves at twice or a hundred times real speed, so the speed knob rests on
 * real time in the middle and, turned either way, starts at a minute a
 * second (the Moon crosses its own width) and climbs evenly through the
 * units things move in to a billion years a second at the end, which goes
 * through the Sun's whole life in a quarter of a minute. Right runs the clock
 * forward, left back. Within ten thousand years of now the clock reads as a
 * calendar; past that, in years from now, to three figures.
 */

import { J2000_MS, YEAR_MS } from '../sky/deep'

const MIN = 60
const HOUR = 3600
const DAY = 86_400
const MONTH = 30.436875 * DAY
const YEAR = 365.2425 * DAY
const TOP = 1e9 * YEAR

/** How far either side of the middle the knob still reads real time. */
export const DEAD = 0.06

/** Simulated seconds per real second with the knob turned to `dial`, -1 to 1: below 0 the clock runs back. */
export function rateOf(dial: number): number {
  const a = Math.min(1, Math.abs(dial))
  if (a < DEAD) return 1
  return Math.sign(dial) * MIN * (TOP / MIN) ** ((a - DEAD) / (1 - DEAD))
}

/** Where the knob gives a speed: `rateOf` the other way. */
export function dialOf(rate: number): number {
  const a = Math.abs(rate)
  if (a < MIN) return 0
  if (a >= TOP) return Math.sign(rate)
  return Math.sign(rate) * (DEAD + ((1 - DEAD) * Math.log(a / MIN)) / Math.log(TOP / MIN))
}

/** The round speeds a step of the knob stops at, each way. */
const ROUND = [MIN, 10 * MIN, HOUR, 6 * HOUR, DAY, 7 * DAY, MONTH, ...[1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9].map((n) => n * YEAR)]
const NOTCHES = [...ROUND.map((r) => dialOf(-r)).reverse(), 0, ...ROUND.map(dialOf)]

/** The next round speed from `dial`, up the knob or down it. */
export function notch(dial: number, way: 1 | -1): number {
  const next = way > 0 ? NOTCHES.find((n) => n > dial + 1e-9) : [...NOTCHES].reverse().find((n) => n < dial - 1e-9)
  return next ?? way
}

/** Each unit's size, short name, and long name for one and for more. */
const UNITS: ReadonlyArray<[number, string, string, string]> = [
  [1e9 * YEAR, 'Gyr', 'billion years', 'billion years'],
  [1e6 * YEAR, 'Myr', 'million years', 'million years'],
  [1e3 * YEAR, 'kyr', 'thousand years', 'thousand years'],
  [YEAR, 'yr', 'year', 'years'],
  [MONTH, 'mo', 'month', 'months'],
  [7 * DAY, 'wk', 'week', 'weeks'],
  [DAY, 'day', 'day', 'days'],
  [HOUR, 'hr', 'hour', 'hours'],
  [MIN, 'min', 'minute', 'minutes'],
]

/** The speed in two figures, in the biggest unit it fills, so it never reads 60 min/s. Null at real time. */
function reading(rate: number): [number, string, string] | null {
  const a = Math.abs(rate)
  if (a < MIN) return null
  for (const [size, short, one, more] of UNITS) {
    const q = a / size
    const n = q < 10 ? Math.round(q * 10) / 10 : Math.round(q)
    if (n >= 1) return [n, short, n === 1 ? one : more]
  }
  return null
}

/** The speed as the knob shows it: "Real time", "+10 min/s", "−2.5 day/s", "+1 Gyr/s". */
export function speedLabel(dial: number): string {
  const rate = rateOf(dial)
  const r = reading(rate)
  return r ? `${rate < 0 ? '−' : '+'}${r[0]} ${r[1]}/s` : 'Real time'
}

/** The same in words: "Real time", "10 minutes a second", "1 day a second, backward", "1 billion years a second". */
export function speedSaid(dial: number): string {
  const rate = rateOf(dial)
  const r = reading(rate)
  if (!r) return 'Real time'
  return `${r[0]} ${r[2]} a second${rate < 0 ? ', backward' : ''}`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function two(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Years from now within which a moment is told by the calendar. */
export const CALENDAR_YEARS = 10_000

/** Years from now to `ms`, less than 0 for the past. */
export function yearsFrom(ms: number, now = Date.now()): number {
  return (ms - now) / YEAR_MS
}

/** Whether `ms` is too far from now for the calendar, and is told in years from now. */
export function isDeep(ms: number, now = Date.now()): boolean {
  return Math.abs(yearsFrom(ms, now)) >= CALENDAR_YEARS
}

/** "12,400", thousands set apart. */
function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A year of the calendar as it is written: "2026", "44 BC" for the year astronomers count as -43, "12,026". */
export function yearLabel(year: number): string {
  const n = year > 0 ? year : 1 - year
  const text = n >= 10_000 ? grouped(n) : String(n)
  return year > 0 ? text : `${text} BC`
}

/** A span of years to three figures, in words or short: "12,400 years", "1.25 million years", or "12.4 kyr", "1.25 Myr". */
function spanLabel(years: number, short: boolean): string {
  const n = Number(Math.abs(years).toPrecision(3))
  if (n < 1e6) return short && n >= 1e4 ? `${(n / 1e3).toPrecision(3)} kyr` : `${grouped(n)} ${short ? 'yr' : 'years'}`
  if (n < 1e9) return `${(n / 1e6).toPrecision(3)} ${short ? 'Myr' : 'million years'}`
  return `${(n / 1e9).toPrecision(3)} ${short ? 'Gyr' : 'billion years'}`
}

/** A moment far from now: "12,400 years ago", "in 5.00 billion years", or short, "12.4 kyr ago". */
export function deepLabel(ms: number, short = false, now = Date.now()): string {
  const y = yearsFrom(ms, now)
  return y < 0 ? `${spanLabel(y, short)} ago` : `in ${spanLabel(y, short)}`
}

/** The same short and in two, for a clock with little room: "12.4 kyr" and "ago", or "5.00 Gyr" and "ahead". */
export function deepParts(ms: number, now = Date.now()): [string, string] {
  const y = yearsFrom(ms, now)
  return [spanLabel(y, true), y < 0 ? 'ago' : 'ahead']
}

/** "5 Oct 2026" or "15 Mar 44 BC", in UTC; far from now, "1.25 million years ago". */
export function dayLabel(ms: number, now = Date.now()): string {
  if (isDeep(ms, now)) return deepLabel(ms, false, now)
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${yearLabel(d.getUTCFullYear())}`
}

/** The moment in full, "5 Oct 2026, 14:32:07 UTC", or as far as it can be told. */
export function momentLabel(ms: number, now = Date.now()): string {
  return isDeep(ms, now) ? dayLabel(ms, now) : `${dayLabel(ms, now)}, ${clockLabel(ms)} UTC`
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

/** A moment in calendar parts, UTC. Months count from 0, as Date's do. */
export interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function partsOf(ms: number): Parts {
  const d = new Date(ms)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

/** Days in a month, leap years and all. */
export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * The moment of some parts. A day past the end of its month is its last day,
 * so the 31st a month on is the 30th rather than the 1st after; hours and
 * minutes past their ends carry on into the next.
 */
export function momentOf(p: Parts): number {
  const d = new Date(0)
  d.setUTCFullYear(p.year, p.month, 1)
  d.setUTCDate(Math.min(p.day, daysIn(d.getUTCFullYear(), d.getUTCMonth())))
  d.setUTCHours(p.hour, p.minute, p.second, 0)
  return d.getTime()
}

/** The same day and time `n` months on, or back. */
export function shiftMonths(ms: number, n: number): number {
  const p = partsOf(ms)
  return momentOf({ ...p, month: p.month + n })
}

/** Where the third figure of the years from now is, while those are told in years: 100 at 12,400 years ago. */
export function deepUnit(ms: number, now = Date.now()): number {
  const n = Number(Math.abs(yearsFrom(ms, now)).toPrecision(3))
  return 10 ** (Math.floor(Math.log10(n)) - 2)
}

/** `n` of those from `ms`, on, or back if `n` is below 0, to a round number of years from now, at the same time of year. */
export function deepStep(ms: number, n: number, now = Date.now()): number {
  const y = yearsFrom(ms, now)
  const unit = deepUnit(ms, now)
  return ms + Math.round(Math.round(y / unit) * unit + n * unit - y) * YEAR_MS
}

/** The widest moment a Date can hold, either way. */
const DATE_MS = 8.64e15

/**
 * `year` at the same time of year as `ms`: by the calendar, the same day and
 * time, within its years of now; whole years on from `ms` past them.
 */
export function inYear(ms: number, year: number, now = Date.now()): number {
  const thisYear = new Date(now).getUTCFullYear()
  if (Math.abs(year - thisYear) < CALENDAR_YEARS) {
    // A moment past what a Date holds lends its time of year from a year near J2000.
    const base = Math.abs(ms) < DATE_MS ? ms : ms - Math.round((ms - J2000_MS) / YEAR_MS) * YEAR_MS
    return momentOf({ ...partsOf(base), year: Math.round(year) })
  }
  return ms + Math.round(year - (2000 + (ms - J2000_MS) / YEAR_MS)) * YEAR_MS
}

const SCALE: Record<string, number> = { k: 1e3, kyr: 1e3, thousand: 1e3, m: 1e6, myr: 1e6, million: 1e6, b: 1e9, bn: 1e9, g: 1e9, gyr: 1e9, billion: 1e9 }

/**
 * A year as it can be typed: "1969", "44 BC" or "-44", "12k ago", "1.5
 * million years ago", "in 5b", "+3 Gyr", "4,500,000,000 BCE". The year as
 * astronomers count it, 1 BC being 0, or null if it means none.
 */
export function readYear(text: string, now = Date.now()): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ')
  const m = /^(in |\+)?([-−])? ?(\d+(?:\.\d*)?|\.\d+)(?:e(\d+))? ?(k|kyr|thousand|m|myr|million|b|bn|g|gyr|billion)? ?(?:years?|yrs?)? ?(ago|bc|bce|ad|ce|ahead|from now|hence)?$/.exec(t)
  if (!m) return null
  const [, ahead, minus, digits, exp, scale, way] = m
  const n = Number(digits) * 10 ** Number(exp ?? 0) * (scale ? (SCALE[scale] as number) : 1)
  const later = ahead !== undefined || way === 'ahead' || way === 'from now' || way === 'hence'
  const before = minus !== undefined || way === 'bc' || way === 'bce'
  if (Number(later) + Number(before) + Number(way === 'ago') > 1 || ((way === 'ad' || way === 'ce') && (later || before))) return null
  const thisYear = new Date(now).getUTCFullYear()
  if (later) return thisYear + n
  if (way === 'ago') return thisYear - n
  return before ? 1 - n : n
}

