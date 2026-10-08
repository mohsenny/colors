import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { daysIn, deepLabel, deepStep, deepUnit, inYear, isDeep, momentOf, partsOf, readYear, shiftMonths, yearLabel } from '../app/time'
import type { Parts } from '../app/time'
import { TIME_MAX, TIME_MIN } from '../sky/ephemeris'
import { DoubleStepIcon, StepIcon } from './Icons'

const DAY_MS = 86_400_000
const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** How long a step is held before it repeats, then how often it does, ms. */
const HOLD_MS = 400
const REPEAT_MS = 80

/** The way from the moment on the clock to another. */
export type To = (ms: number) => number

export interface WhenProps {
  open: boolean
  /** The moment on the clock, UTC ms. */
  ms: number
  /** Where the clock's centre is along the dock, px, for the drawer to open over it. */
  at: number
  /** Goes the way given from the moment the clock is on, and says whether that moved it. */
  onGo(to: To): boolean
}

function clamp(ms: number): number {
  return Math.max(TIME_MIN, Math.min(TIME_MAX, ms))
}

/** What some typing means so far, null if nothing yet, and whether it is complete. */
type Read = (text: string) => { n: number; full: boolean } | null

/** A number, complete once all its digits are in or one more would take it past `max`. */
function numberRead(min: number, max: number, digits: number): Read {
  return (text) => {
    const t = text.replace(/\D/g, '')
    const n = Number(t)
    if (t === '') return null
    if (t.length >= digits) return { n: Math.max(min, Math.min(max, n)), full: true }
    return n >= min && n <= max ? { n, full: n * 10 > max } : null
  }
}

/** A year in any of the ways `readYear` takes, never complete: it could always go on, "1969" to "1969 BC". */
const yearRead: Read = (text) => {
  const year = readYear(text)
  return year === null ? null : { n: year, full: false }
}

/** Only a year of four figures is gone to while typed: on the way to "4.5 billion years ago" are years the Sun has swallowed the Earth by. */
const calendarYear = (text: string): boolean => /^\d{4}$/.test(text.trim())

const hourRead = numberRead(0, 23, 2)
const minuteRead = numberRead(0, 59, 2)
const monthNumber = numberRead(1, 12, 2)

/** A month by its number or the start of its name, the first it could be until there is only one. */
const monthRead: Read = (text) => {
  const t = text.trim().toLowerCase()
  if (/^\d+$/.test(t)) {
    const r = monthNumber(t)
    return r && { n: r.n - 1, full: r.full }
  }
  const hits = NAMES.filter((name) => t && name.toLowerCase().startsWith(t))
  return hits.length ? { n: NAMES.indexOf(hits[0] as string), full: false } : null
}

interface FieldProps {
  text: string
  read: Read
  /** Characters it holds. */
  size: number
  label: string
  tab: number | undefined
  className?: string
  numeric?: boolean
  /** Goes there while still being typed, as soon as it means anything, or once it is typed as this says. */
  live?: boolean | ((text: string) => boolean)
  disabled?: boolean
  style?: CSSProperties
  onSet(n: number): void
  onStep(n: number): void
}

/**
 * Something to type over, or step with the arrow keys, Shift for ten. It
 * takes as soon as it is complete, and otherwise when it is left, if it means
 * anything by then.
 */
function Field(props: FieldProps): ReactElement {
  const { text, read, size, label, tab, className = '', numeric = true, live = false, disabled = false, style, onSet, onStep } = props
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement | null>(null)
  const fresh = useRef(false)

  const leave = (): void => {
    if (draft === null) return
    const r = read(draft)
    if (r) onSet(r.n)
    setDraft(null)
  }
  // Selected again, so what is typed next starts afresh.
  const again = (): void => {
    requestAnimationFrame(() => {
      if (document.activeElement === ref.current) ref.current?.select()
    })
  }

  return (
    <input
      ref={ref}
      type="text"
      className={`sl-field ${className}`}
      inputMode={numeric ? 'numeric' : 'text'}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="done"
      maxLength={size}
      aria-label={label}
      tabIndex={tab}
      disabled={disabled}
      style={style}
      value={draft ?? text}
      onFocus={(e) => e.target.select()}
      // Safari puts the caret where it was clicked, after the focus.
      onPointerDown={(e) => {
        fresh.current = document.activeElement !== e.currentTarget
      }}
      onClick={(e) => {
        if (fresh.current) e.currentTarget.select()
        fresh.current = false
      }}
      onChange={(e) => {
        const typed = e.target.value
        const r = read(typed)
        if (!r?.full) {
          setDraft(typed)
          if (r && (live === true || (live && live(typed)))) onSet(r.n)
          return
        }
        setDraft(null)
        onSet(r.n)
        again()
      }}
      onBlur={leave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          leave()
          again()
        }
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        setDraft(null)
        onStep((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
      }}
    />
  )
}

interface StepProps {
  label: string
  back?: boolean
  /** Ten times as far, with two chevrons. */
  far?: boolean
  ms: number
  to: To
  tab: number | undefined
  disabled?: boolean
  onGo(to: To): boolean
}

/** A step one way, taken again and again while it is held down. */
function Step({ label, back = false, far = false, ms, to, tab, disabled = false, onGo }: StepProps): ReactElement {
  const timer = useRef(0)
  const pressed = useRef(false)
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <button
      type="button"
      className="lb-step-btn"
      aria-label={label}
      disabled={disabled || clamp(to(ms)) === ms}
      tabIndex={tab}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        pressed.current = true
        if (!onGo(to)) return
        const stop = (): void => {
          clearTimeout(timer.current)
          window.removeEventListener('pointerup', stop)
          window.removeEventListener('pointercancel', stop)
        }
        const again = (wait: number): void => {
          timer.current = window.setTimeout(() => (onGo(to) ? again(REPEAT_MS) : stop()), wait)
        }
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
        again(HOLD_MS)
      }}
      onKeyDown={() => {
        pressed.current = false
      }}
      // A pointer stepped on its way down; the keys, and readers, step here.
      onClick={() => {
        if (!pressed.current) onGo(to)
        pressed.current = false
      }}
    >
      {far ? <DoubleStepIcon back={back} /> : <StepIcon back={back} />}
    </button>
  )
}

/** Years by the calendar; past its years, by the third figure of the years from now. */
const years =
  (n: number): To =>
  (ms) =>
    isDeep(ms) ? deepStep(ms, n) : shiftMonths(ms, 12 * n)
const months = (n: number): To => (ms) => shiftMonths(ms, n)
const days = (n: number): To => (ms) => ms + n * DAY_MS
const turn =
  (part: 'hour' | 'minute', n: number): To =>
  (ms) => {
    const p = partsOf(ms)
    return momentOf({ ...p, [part]: p[part] + n, second: 0 })
  }

/** "A year", "10 million years": a step of the year, in words. */
function yearsSaid(n: number): string {
  if (n >= 1e9) return `${n / 1e9} billion years`
  if (n >= 1e6) return `${n / 1e6} million years`
  return n === 1 ? 'A year' : `${n.toLocaleString('en-US')} years`
}

/**
 * The drawer behind the clock, for the years a sky is looked at across: the
 * year first and large, one at a time or ten, then the month and the day, and
 * the time. Each is typed over or stepped, and held a step repeats. Each change
 * goes there at once and the drawer stays, so the sky can be watched while the
 * date is found. A day keeps the time of day, and a time keeps the day. Past
 * the calendar's years the year is years from now, typed as "4.5 billion years
 * ago" or "in 5 Gyr", stepped by its third figure, and the rest has no say.
 */
export function When({ open, ms, at, onGo }: WhenProps): ReactElement {
  const tab = open ? undefined : -1
  const deep = isDeep(ms)
  const p = deep ? null : partsOf(ms)
  const step = { ms, tab, onGo }
  const off = { ...step, disabled: deep }
  const set = (change: Partial<Parts>): void => {
    onGo((now) => momentOf({ ...partsOf(now), ...change }))
  }
  const year = p ? yearLabel(p.year) : deepLabel(ms, true)
  const unit = deep ? deepUnit(ms) : 1
  const by = (n: number, back: boolean): string => `${yearsSaid(n * unit)} ${back ? 'back' : 'on'}`

  return (
    <div
      className={`lb-options sl-when${open ? ' is-open' : ''}`}
      style={{ '--sl-when-x': `${at}px` } as CSSProperties}
      aria-hidden={open ? undefined : 'true'}
    >
      <div className="sl-when-year" role="group" aria-label="Year">
        <Step {...step} label={by(10, true)} back far to={years(-10)} />
        <Step {...step} label={by(1, true)} back to={years(-1)} />
        <Field
          text={year}
          read={yearRead}
          size={24}
          label="Year"
          tab={tab}
          className={`is-year${year.length > 4 ? ' is-long' : ''}`}
          numeric={false}
          live={calendarYear}
          // Smaller as it is longer, to keep in its place.
          style={{ fontSize: `${Math.min(26, 165 / year.length)}px` }}
          onSet={(y) => onGo((now) => inYear(now, y))}
          onStep={(n) => onGo(years(n))}
        />
        <Step {...step} label={by(1, false)} to={years(1)} />
        <Step {...step} label={by(10, false)} far to={years(10)} />
      </div>

      <div className={`lb-opt-row${deep ? ' is-off' : ''}`}>
        <span className="lb-opt-label" id="sl-when-month">
          Month
        </span>
        <div className="lb-stepper" role="group" aria-labelledby="sl-when-month">
          <Step {...off} label="A month back" back to={months(-1)} />
          <Field
            text={p ? (NAMES[p.month] as string) : ''}
            read={monthRead}
            size={9}
            label="Month"
            tab={tab}
            numeric={false}
            live
            disabled={deep}
            onSet={(month) => set({ month })}
            onStep={(n) => onGo(months(n))}
          />
          <Step {...off} label="A month on" to={months(1)} />
        </div>
      </div>

      <div className={`lb-opt-row${deep ? ' is-off' : ''}`}>
        <span className="lb-opt-label" id="sl-when-day">
          Day
        </span>
        <div className="lb-stepper" role="group" aria-labelledby="sl-when-day">
          <Step {...off} label="A day back" back to={days(-1)} />
          <Field
            text={p ? String(p.day) : ''}
            read={numberRead(1, p ? daysIn(p.year, p.month) : 31, 2)}
            size={2}
            label="Day"
            tab={tab}
            disabled={deep}
            onSet={(day) => set({ day })}
            onStep={(n) => onGo(days(n))}
          />
          <Step {...off} label="A day on" to={days(1)} />
        </div>
      </div>

      <div className={`lb-opt-row${deep ? ' is-off' : ''}`}>
        <span className="lb-opt-label">Time</span>
        <div className="sl-when-hm">
          <Field
            text={p ? String(p.hour).padStart(2, '0') : ''}
            read={hourRead}
            size={2}
            label="Hour, UTC"
            tab={tab}
            className="is-time"
            disabled={deep}
            onSet={(hour) => set({ hour, second: 0 })}
            onStep={(n) => onGo(turn('hour', n))}
          />
          <span className="sl-when-colon" aria-hidden="true">
            :
          </span>
          <Field
            text={p ? String(p.minute).padStart(2, '0') : ''}
            read={minuteRead}
            size={2}
            label="Minute"
            tab={tab}
            className="is-time"
            disabled={deep}
            onSet={(minute) => set({ minute, second: 0 })}
            onStep={(n) => onGo(turn('minute', n))}
          />
          <span className="sl-when-zone">UTC</span>
        </div>
      </div>
    </div>
  )
}
