import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'
import { daysIn, leadOf, momentOf, partsOf, shiftMonths } from '../app/time'
import { eclipsesBetween } from '../sky/eclipses'
import type { Eclipse } from '../sky/eclipses'
import { TIME_MAX, TIME_MIN } from '../sky/ephemeris'
import { StepIcon } from './Icons'

const DAY_MS = 86_400_000
const YEAR_MIN = new Date(TIME_MIN).getUTCFullYear()
const YEAR_MAX = new Date(TIME_MAX).getUTCFullYear()
const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Days the grid's arrow keys move, Up and Down a week. */
const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
const NONE = new Map<number, Eclipse[]>()

export interface WhenProps {
  open: boolean
  /** The moment on the clock, UTC ms. */
  ms: number
  /** Where the clock's centre is along the dock, px, for the drawer to open over it. */
  at: number
  /** When the drawer was opened, UTC ms, for today's ring. */
  opened: number
  onPick(ms: number): void
}

function clamp(ms: number): number {
  return Math.max(TIME_MIN, Math.min(TIME_MAX, ms))
}

let last: { key: number; marks: Map<number, Eclipse[]> } | null = null

/** The eclipses with their peak in a month, by the day of it. The last month asked for is kept. */
function marksOf(year: number, month: number): Map<number, Eclipse[]> {
  const key = year * 12 + month
  if (last?.key === key) return last.marks
  const marks = new Map<number, Eclipse[]>()
  try {
    for (const e of eclipsesBetween(Date.UTC(year, month, 1), Date.UTC(year, month + 1, 1))) {
      const day = new Date(e.peak).getUTCDate()
      marks.set(day, [...(marks.get(day) ?? []), e])
    }
  } catch {
    // Unmarked rather than broken, as the eclipse drawer is when a search fails.
  }
  last = { key, marks }
  return marks
}

interface FieldProps {
  value: number
  digits: number
  min: number
  max: number
  label: string
  tab: number | undefined
  onSet(n: number): void
  onStep(n: number): void
}

/**
 * A number to type over, or step with the arrow keys, Shift for ten. It takes
 * as soon as all its digits are in; fewer count when it is left, if they make
 * sense on their own.
 */
function Field({ value, digits, min, max, label, tab, onSet, onStep }: FieldProps): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement | null>(null)

  const done = (text: string, whole: boolean): void => {
    setDraft(null)
    const n = Number(text)
    if (text === '') return
    if (whole) onSet(Math.max(min, Math.min(max, n)))
    else if (n >= min && n <= max) onSet(n)
  }

  return (
    <input
      ref={ref}
      type="text"
      className="sl-field"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      maxLength={digits}
      size={digits}
      aria-label={label}
      tabIndex={tab}
      value={draft ?? String(value).padStart(digits, '0')}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const text = e.target.value.replace(/\D/g, '').slice(0, digits)
        if (text.length < digits) {
          setDraft(text)
          return
        }
        done(text, true)
        // Selected again, so the next digit typed starts a new number.
        requestAnimationFrame(() => {
          if (document.activeElement === ref.current) ref.current?.select()
        })
      }}
      onBlur={() => draft !== null && done(draft, false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && draft !== null) done(draft, false)
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        setDraft(null)
        onStep((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
      }}
    />
  )
}

/**
 * The drawer behind the clock: a month of days to pick from, with the
 * eclipses in it marked, and the time. Each change goes there at once and the
 * drawer stays, so the sky can be watched while the date is found. A day keeps
 * the time of day, and a time keeps the day.
 */
export function When({ open, ms, at, opened, onPick }: WhenProps): ReactElement {
  const tab = open ? undefined : -1
  const p = partsOf(ms)
  const { year, month, day } = p
  const lead = leadOf(year, month)
  const today = Math.floor(opened / DAY_MS) * DAY_MS
  const gridRef = useRef<HTMLDivElement | null>(null)
  const follow = useRef(false)
  // Searched only while open: closed, a fast clock would cross months many times a second.
  const marks = open ? marksOf(year, month) : NONE

  // A day moved to with the keys takes the focus with it.
  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    gridRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
  }, [year, month, day])

  const go = (to: number): void => onPick(clamp(to))
  const can = (to: number): boolean => clamp(to) !== ms

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const by = MOVES[e.key]
    let to: number
    if (by !== undefined) to = ms + by * DAY_MS
    else if (e.key === 'PageUp' || e.key === 'PageDown') to = shiftMonths(ms, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1))
    else return
    e.preventDefault()
    if (!can(to)) return
    follow.current = true
    go(to)
  }

  const step = (label: string, to: number, back: boolean): ReactElement => (
    <button type="button" className="lb-step-btn" aria-label={label} disabled={!can(to)} tabIndex={tab} onClick={() => go(to)}>
      <StepIcon back={back} />
    </button>
  )

  return (
    <div
      className={`lb-options sl-when${open ? ' is-open' : ''}`}
      style={{ '--sl-when-x': `${at}px` } as CSSProperties}
      aria-hidden={open ? undefined : 'true'}
    >
      <div className="sl-when-head">
        <div className="lb-stepper" role="group" aria-label="Month">
          {step('Previous month', shiftMonths(ms, -1), true)}
          <span className="sl-when-month">{NAMES[month]}</span>
          {step('Next month', shiftMonths(ms, 1), false)}
        </div>
        <div className="lb-stepper" role="group" aria-label="Year">
          {step('Previous year', shiftMonths(ms, -12), true)}
          <Field
            value={year}
            digits={4}
            min={YEAR_MIN}
            max={YEAR_MAX}
            label="Year"
            tab={tab}
            onSet={(y) => go(momentOf({ ...p, year: y }))}
            onStep={(n) => go(shiftMonths(ms, 12 * n))}
          />
          {step('Next year', shiftMonths(ms, 12), false)}
        </div>
      </div>

      <div ref={gridRef} className="sl-when-grid" role="group" aria-label={`${NAMES[month]} ${year}`} onKeyDown={onGridKey}>
        {WEEK.map((w) => (
          <span key={w} className="sl-when-weekday" aria-hidden="true">
            {w[0]}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysIn(year, month) }, (_, i) => {
          const d = i + 1
          const start = Date.UTC(year, month, d)
          const seen = marks.get(d) ?? []
          return (
            <button
              key={d}
              type="button"
              className={`sl-day${start === today ? ' is-today' : ''}`}
              aria-pressed={d === day}
              aria-current={start === today ? 'date' : undefined}
              aria-label={[`${WEEK[(lead + i) % 7]} ${d} ${NAMES[month]} ${year}`, ...seen.map((e) => `${e.kind.toLowerCase()} ${e.type} eclipse`)].join(', ')}
              title={seen.map((e) => `${e.kind} ${e.type} eclipse`).join(', ') || undefined}
              disabled={start > TIME_MAX || start + DAY_MS <= TIME_MIN}
              tabIndex={d === day ? tab : -1}
              onClick={() => go(momentOf({ ...p, day: d }))}
            >
              {d}
              {seen.length > 0 && (
                <span className="sl-day-marks" aria-hidden="true">
                  {seen.map((e) => (
                    <span key={e.type} className={`sl-day-mark is-${e.type}`} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="lb-opt-row sl-when-time">
        <span className="lb-opt-label">Time</span>
        <div className="sl-when-hm">
          <Field
            value={p.hour}
            digits={2}
            min={0}
            max={23}
            label="Hour, UTC"
            tab={tab}
            onSet={(h) => go(momentOf({ ...p, hour: h, second: 0 }))}
            onStep={(n) => go(momentOf({ ...p, hour: p.hour + n, second: 0 }))}
          />
          <span className="sl-when-colon" aria-hidden="true">
            :
          </span>
          <Field
            value={p.minute}
            digits={2}
            min={0}
            max={59}
            label="Minute"
            tab={tab}
            onSet={(m) => go(momentOf({ ...p, minute: m, second: 0 }))}
            onStep={(n) => go(momentOf({ ...p, minute: p.minute + n, second: 0 }))}
          />
          <span className="sl-when-zone">UTC</span>
        </div>
      </div>
    </div>
  )
}
