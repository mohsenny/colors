import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHONE_U_MIN, STEP } from '../layout'
import { LIFE } from '../life'
import {
  GLIDE_BACK_MS,
  GLIDE_MS,
  HOLD_MS,
  HOLD_PER_WORD_MS,
  Instrument,
  SQUEEZE,
  chapterAt,
  holdOf,
  holdOfNow,
  indexAt,
  nearest,
  positionAt,
  stopsOf,
  tapeOf,
  yearLabel,
  yearNow,
  words,
} from './instrument'

/** Early October 2026, so the tests do not move with the calendar. */
const NOW = 2026.76

const stops = stopsOf(LIFE, NOW)
const index = (id: string): number => LIFE.chapters.findIndex((c) => c.id === id)

describe('the tape', () => {
  it('squeezes Growing up into the first tenth and runs true from 2008', () => {
    expect(stops[0]).toBe(0)
    expect(stops[index('bachelor')]).toBeCloseTo(SQUEEZE, 9)
    expect(tapeOf(NOW, 2008, NOW)).toBe(1)
    // Four years of eighteen and three quarters, on the nine tenths that are true.
    expect(stops[index('finland')]).toBeCloseTo(SQUEEZE + (0.9 * 4) / 18.76, 9)
  })

  it('gives every chapter a stop of its own, in order', () => {
    for (let i = 1; i < stops.length; i++) expect(stops[i] as number).toBeGreaterThan(stops[i - 1] as number)
    expect(stops[index('with-ai')]).toBeGreaterThan(stops[index('leading-qa')] as number)
    expect(stops[stops.length - 1]).toBeLessThan(1)
  })

  it('reads Iran before 2008, and the year after it', () => {
    expect(yearLabel(0, LIFE, NOW)).toBe('Iran')
    expect(yearLabel(SQUEEZE / 2, LIFE, NOW)).toBe('Iran')
    expect(yearLabel(SQUEEZE, LIFE, NOW)).toBe('2008')
    expect(yearLabel(stops[index('finland')] as number, LIFE, NOW)).toBe('2012')
    expect(yearLabel(stops[index('leading-qa')] as number, LIFE, NOW)).toBe('2018')
    expect(yearLabel(stops[index('with-ai')] as number, LIFE, NOW)).toBe('2024')
    expect(yearLabel(1, LIFE, NOW)).toBe('2026')
  })

  it('knows the year now, fraction and all', () => {
    expect(yearNow(new Date(Date.UTC(2026, 0, 1)))).toBe(2026)
    expect(yearNow(new Date(Date.UTC(2026, 6, 2, 12)))).toBeCloseTo(2026.5, 2)
  })
})

describe('year to chapter', () => {
  it('is the last chapter started by that point, and none at Now', () => {
    expect(chapterAt(0, stops)).toBe(0)
    expect(chapterAt(SQUEEZE / 2, stops)).toBe(0)
    expect(chapterAt(SQUEEZE, stops)).toBe(index('bachelor'))
    const berlin = stops[index('automation')] as number
    expect(chapterAt(berlin - 0.001, stops)).toBe(index('finland'))
    expect(chapterAt(berlin + 0.001, stops)).toBe(index('automation'))
    expect(chapterAt(0.999, stops)).toBe(index('with-ai'))
    expect(chapterAt(1, stops)).toBe(null)
  })
})

describe('counting in chapters', () => {
  it('is whole at each stop and the number of chapters at Now, and runs straight between', () => {
    for (const [i, s] of stops.entries()) expect(indexAt(s, stops)).toBeCloseTo(i, 9)
    expect(indexAt(1, stops)).toBe(stops.length)
    const berlin = stops[index('automation')] as number
    const lead = stops[index('leading-qa')] as number
    expect(indexAt(berlin + (lead - berlin) * 0.25, stops)).toBeCloseTo(index('automation') + 0.25, 9)
  })

  it('turns back into the same point on the tape, and keeps to the tape', () => {
    for (const k of [0, 0.5, 1.25, 3.9, 5.5, 6]) expect(indexAt(positionAt(k, stops), stops)).toBeCloseTo(k, 9)
    expect(positionAt(-1, stops)).toBe(0)
    expect(positionAt(9, stops)).toBe(1)
  })
})

describe('snapping', () => {
  it('settles on the nearest stop, Now included', () => {
    for (const [i, s] of stops.entries()) {
      expect(nearest(s, stops)).toBe(i)
      expect(nearest(s + 0.004, stops)).toBe(i)
    }
    expect(nearest(0.99, stops)).toBe(null)
    expect(nearest(1, stops)).toBe(null)
    const berlin = stops[index('automation')] as number
    const lead = stops[index('leading-qa')] as number
    expect(nearest(berlin + (lead - berlin) * 0.4, stops)).toBe(index('automation'))
    expect(nearest(berlin + (lead - berlin) * 0.6, stops)).toBe(index('leading-qa'))
  })

  describe('a scrub', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('moves the chapter as it goes and lands on a stop when it stops', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('automation'))
      // No stage, so a pixel of wheel is a thousandth of the tape.
      ins.scroll(20)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      ins.scroll(150)
      expect(ins.getSnapshot().chapter).toBe(index('leading-qa'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('leading-qa'))
      expect(ins.getSnapshot().year).toBe('2018')
      ins.scroll(1000)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(null)
    })

    it('says where it landed once, not while it moved', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('finland'))
      const said = ins.getSnapshot().announce
      expect(said).toBe('Finland, 2012 to 2015')
      ins.scroll(150)
      expect(ins.getSnapshot().announce).toBe(said)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().announce).toBe('Automation, 2016 to 2018')
    })

    it('says Growing up mid-sentence', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(0)
      expect(ins.getSnapshot().announce).toBe('Growing up, until 2008')
    })

    it('follows the tape while it is dragged and settles only when it is let go', () => {
      const ins = new Instrument({ now: NOW })
      const berlin = stops[index('automation')] as number
      const lead = stops[index('leading-qa')] as number
      ins.scrubTo(berlin + (lead - berlin) * 0.4)
      expect(ins.getSnapshot()).toMatchObject({ chapter: index('automation'), year: '2016' })
      // A drag held still is still a drag: no timer settles it.
      vi.advanceTimersByTime(5000)
      expect(ins.getSnapshot().announce).toBe('')
      ins.scrubTo(berlin + (lead - berlin) * 0.6)
      ins.scrubEnd()
      vi.advanceTimersByTime(GLIDE_MS)
      expect(ins.getSnapshot()).toMatchObject({ chapter: index('leading-qa'), year: '2018' })
      expect(ins.getSnapshot().announce).toBe('Leading QA, 2018 to now')
      ins.scrubTo(1.5)
      ins.scrubEnd()
      expect(ins.getSnapshot().chapter).toBe(null)
    })

    it('stops Play for a drag of the tape', () => {
      const ins = new Instrument({ now: NOW })
      ins.togglePlay()
      ins.scrubTo(0.5)
      expect(ins.getSnapshot().playing).toBe(false)
    })
  })

  describe('a swipe', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    /** A finger across the film by `dx` px, through the handlers the stage listens with. */
    function swipe(ins: Instrument, dx: number): void {
      const hand = ins as unknown as Record<'onDown' | 'onMove' | 'onUp', (e: object) => void>
      const at = { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 }
      hand.onDown(at)
      for (let i = 1; i <= 10; i++) hand.onMove({ ...at, clientX: 300 + (dx * i) / 10 })
      hand.onUp({ ...at, clientX: 300 + dx })
      vi.advanceTimersByTime(GLIDE_MS)
    }

    const step = PHONE_U_MIN * STEP

    it('moves one chapter, however far the finger goes', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('finland'))
      vi.advanceTimersByTime(GLIDE_MS)
      swipe(ins, -3 * step)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      swipe(ins, 2.5 * step)
      expect(ins.getSnapshot().chapter).toBe(index('finland'))
    })

    it('stays put for a finger that goes less than half a sheet and stops', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('finland'))
      vi.advanceTimersByTime(GLIDE_MS)
      const hand = ins as unknown as Record<'onDown' | 'onMove' | 'onUp', (e: object) => void>
      const at = { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 }
      hand.onDown(at)
      hand.onMove({ ...at, clientX: 300 - 0.3 * step })
      vi.advanceTimersByTime(200)
      hand.onUp({ ...at, clientX: 300 - 0.3 * step })
      vi.advanceTimersByTime(GLIDE_MS)
      expect(ins.getSnapshot().chapter).toBe(index('finland'))
    })
  })
})

describe('stepping', () => {
  it('walks the chapters, on to Now and back to the last', () => {
    const ins = new Instrument({ now: NOW })
    ins.stepBy(1)
    expect(ins.getSnapshot().chapter).toBe(null)
    ins.stepBy(-1)
    expect(ins.getSnapshot().chapter).toBe(LIFE.chapters.length - 1)
    ins.go(0)
    ins.stepBy(-1)
    expect(ins.getSnapshot().chapter).toBe(0)
    ins.stepBy(1)
    expect(ins.getSnapshot().chapter).toBe(1)
    expect(ins.getSnapshot().year).toBe('2008')
  })
})

describe('Play', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Every face is held past 9s and under half a minute: With AI, at the 500
  // characters life.test.ts allows a copy, comes to 24.7s.
  it('holds a beat and a glance for every word and every logo, and never past half a minute', () => {
    expect(words('B.Sc. in  Software Engineering, and .NET apps.')).toBe(7)
    const growing = LIFE.chapters[index('growing-up')] as (typeof LIFE.chapters)[number]
    const said = words(`${growing.headline} ${growing.copy}`)
    expect(holdOf(growing)).toBe(HOLD_MS + HOLD_PER_WORD_MS * (said + growing.tools.length))
    for (const hold of [...LIFE.chapters.map(holdOf), holdOfNow(LIFE)]) {
      expect(hold).toBeGreaterThan(9000)
      expect(hold).toBeLessThan(30000)
    }
  })

  it('walks from the start through every chapter to Now and back, and says nothing on the way', () => {
    const ins = new Instrument({ now: NOW })
    ins.togglePlay()
    // From Now, the long way back to the start first.
    expect(ins.getSnapshot().chapter).toBe(0)
    vi.advanceTimersByTime(GLIDE_BACK_MS - GLIDE_MS)
    const seen: (number | null)[] = []
    for (const c of LIFE.chapters) {
      const snap = ins.getSnapshot()
      seen.push(snap.chapter)
      expect(snap.playing).toBe(true)
      expect(snap.announce).toBe('')
      vi.advanceTimersByTime(GLIDE_MS + holdOf(c) - 1)
      expect(ins.getSnapshot().chapter).toBe(snap.chapter)
      vi.advanceTimersByTime(1)
    }
    expect(seen).toEqual(LIFE.chapters.map((_, i) => i))
    expect(ins.getSnapshot()).toMatchObject({ chapter: null, playing: true, announce: '' })
    vi.advanceTimersByTime(GLIDE_MS + holdOfNow(LIFE) - 1)
    expect(ins.getSnapshot().chapter).toBe(null)
    vi.advanceTimersByTime(1)
    expect(ins.getSnapshot()).toMatchObject({ chapter: 0, playing: true })
  })

  it('waits while the pointer is on the story, and stops for a step or a scroll', () => {
    const ins = new Instrument({ now: NOW })
    ins.go(index('bachelor'))
    ins.togglePlay()
    ins.holdPlay(true)
    vi.advanceTimersByTime(60_000)
    expect(ins.getSnapshot().chapter).toBe(1)
    ins.holdPlay(false)
    vi.advanceTimersByTime(holdOf(LIFE.chapters[1] as (typeof LIFE.chapters)[number]))
    expect(ins.getSnapshot().chapter).toBe(2)
    ins.go(0)
    ins.togglePlay()
    vi.advanceTimersByTime(GLIDE_MS + holdOf(LIFE.chapters[0] as (typeof LIFE.chapters)[number]))
    expect(ins.getSnapshot().chapter).toBe(1)
    ins.stepBy(1)
    expect(ins.getSnapshot().playing).toBe(false)
    ins.togglePlay()
    ins.scroll(5)
    expect(ins.getSnapshot().playing).toBe(false)
  })

  it('stops for any other key, and stopping when stopped changes nothing', () => {
    const ins = new Instrument({ now: NOW })
    ins.togglePlay()
    const at = ins.getSnapshot().chapter
    ins.stop()
    expect(ins.getSnapshot()).toMatchObject({ playing: false, chapter: at })
    const before = ins.getSnapshot()
    ins.stop()
    expect(ins.getSnapshot()).toBe(before)
  })
})

describe('the list', () => {
  it('opens and closes from the chip', () => {
    const ins = new Instrument({ now: NOW })
    ins.toggleList()
    expect(ins.getSnapshot().list).toBe(true)
    ins.toggleList()
    expect(ins.getSnapshot().list).toBe(false)
  })
})

describe('Escape', () => {
  it('closes the paper, then the list, then goes back to Now', () => {
    const ins = new Instrument({ now: NOW })
    ins.go(index('automation'))
    ins.openList()
    ins.openPaper()
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, list: true, chapter: index('automation') })
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, list: false, chapter: index('automation') })
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, list: false, chapter: null })
    expect(ins.getSnapshot().announce).toBe('Now')
  })

  it('stops Play on the way back to Now', () => {
    vi.useFakeTimers()
    const ins = new Instrument({ now: NOW })
    ins.togglePlay()
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ playing: false, chapter: null })
    vi.useRealTimers()
  })
})
