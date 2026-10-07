import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHONE_U_MIN, STEP } from '../layout'
import { LIFE } from '../life'
import {
  COVER,
  GLIDE_BACK_MS,
  GLIDE_MS,
  HOLD_MS,
  HOLD_PER_WORD_MS,
  Instrument,
  chapterAt,
  holdOf,
  indexAt,
  nearest,
  positionAt,
  stopsOf,
  yearLabel,
  words,
} from './instrument'

const stops = stopsOf(LIFE)
const index = (id: string): number => LIFE.chapters.findIndex((c) => c.id === id)
/** A chapter's stop on the tape: one on from its index, the cover's being first. */
const stopOf = (id: string): number => stops[index(id) + 1] as number
const latest = LIFE.chapters.length - 1

describe('the tape', () => {
  it('starts with the cover and spaces the chapters evenly after it, the latest at the end', () => {
    expect(stops).toHaveLength(LIFE.chapters.length + 1)
    expect(stops[0]).toBe(0)
    expect(stopOf('with-ai')).toBe(1)
    for (let i = 1; i < stops.length; i++) {
      expect((stops[i] as number) - (stops[i - 1] as number)).toBeCloseTo(1 / LIFE.chapters.length, 9)
    }
  })

  it("reads the year he was born up to the first stop, and each chapter's first year at its own", () => {
    expect(yearLabel(0, LIFE, stops)).toBe(String(LIFE.born))
    expect(yearLabel(stopOf('growing-up') / 2, LIFE, stops)).toBe(String(LIFE.born))
    expect(yearLabel(stopOf('growing-up'), LIFE, stops)).toBe(String(LIFE.born))
    expect(yearLabel(stopOf('bachelor'), LIFE, stops)).toBe('2008')
    expect(yearLabel(stopOf('finland'), LIFE, stops)).toBe('2012')
    expect(yearLabel(stopOf('leading-qa'), LIFE, stops)).toBe('2018')
    expect(yearLabel(1, LIFE, stops)).toBe('2024')
  })

  it('runs the years straight between two stops', () => {
    const lead = stopOf('leading-qa')
    const ai = stopOf('with-ai')
    expect(yearLabel(lead + (ai - lead) / 2, LIFE, stops)).toBe('2021')
  })
})

describe('year to chapter', () => {
  it('is the last chapter started by that point, and the cover before the first', () => {
    expect(chapterAt(0, stops)).toBe(COVER)
    expect(chapterAt(stopOf('growing-up') / 2, stops)).toBe(COVER)
    expect(chapterAt(stopOf('growing-up'), stops)).toBe(0)
    expect(chapterAt(stopOf('bachelor'), stops)).toBe(index('bachelor'))
    const berlin = stopOf('automation')
    expect(chapterAt(berlin - 0.001, stops)).toBe(index('finland'))
    expect(chapterAt(berlin + 0.001, stops)).toBe(index('automation'))
    expect(chapterAt(0.999, stops)).toBe(index('leading-qa'))
    expect(chapterAt(1, stops)).toBe(index('with-ai'))
  })
})

describe('counting in stops', () => {
  it('is whole at each stop and runs straight between', () => {
    for (const [i, s] of stops.entries()) expect(indexAt(s, stops)).toBeCloseTo(i, 9)
    expect(indexAt(1, stops)).toBe(latest + 1)
    const berlin = stopOf('automation')
    const lead = stopOf('leading-qa')
    expect(indexAt(berlin + (lead - berlin) * 0.25, stops)).toBeCloseTo(index('automation') + 1.25, 9)
  })

  it('turns back into the same point on the tape, and keeps to the tape', () => {
    for (const k of [0, 0.5, 1.25, 3.9, 4.5, latest + 1]) expect(indexAt(positionAt(k, stops), stops)).toBeCloseTo(k, 9)
    expect(positionAt(-1, stops)).toBe(0)
    expect(positionAt(9, stops)).toBe(1)
  })
})

describe('snapping', () => {
  it('settles on the nearest stop, the cover the first', () => {
    for (const [i, s] of stops.entries()) {
      expect(nearest(s, stops)).toBe(i - 1)
      expect(nearest(s + 0.004, stops)).toBe(i - 1)
    }
    expect(nearest(0, stops)).toBe(COVER)
    expect(nearest(0.99, stops)).toBe(latest)
    expect(nearest(1, stops)).toBe(latest)
    const berlin = stopOf('automation')
    const lead = stopOf('leading-qa')
    expect(nearest(berlin + (lead - berlin) * 0.4, stops)).toBe(index('automation'))
    expect(nearest(berlin + (lead - berlin) * 0.6, stops)).toBe(index('leading-qa'))
  })

  describe('a scrub', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('moves the chapter as it goes and lands on a stop when it stops', () => {
      const ins = new Instrument()
      ins.go(index('automation'))
      // No stage, so a pixel of wheel is a thousandth of the tape.
      ins.scroll(20)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      ins.scroll(150)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('leading-qa'))
      expect(ins.getSnapshot().year).toBe('2018')
      ins.scroll(1000)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(latest)
    })

    it('says where it landed once, not while it moved', () => {
      const ins = new Instrument()
      ins.go(index('finland'))
      const said = ins.getSnapshot().announce
      expect(said).toBe('Finland, 2012 to 2015')
      ins.scroll(150)
      expect(ins.getSnapshot().announce).toBe(said)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().announce).toBe('Automation, 2016 to 2018')
    })

    it('says Growing up mid-sentence', () => {
      const ins = new Instrument()
      ins.go(0)
      expect(ins.getSnapshot().announce).toBe('Growing up, until 2008')
    })

    it('follows the tape while it is dragged and settles only when it is let go', () => {
      const ins = new Instrument()
      const berlin = stopOf('automation')
      const lead = stopOf('leading-qa')
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
      expect(ins.getSnapshot().chapter).toBe(latest)
      ins.scrubTo(-0.5)
      ins.scrubEnd()
      expect(ins.getSnapshot()).toMatchObject({ chapter: COVER, announce: 'Introduction' })
    })

    it('stops Play for a drag of the tape', () => {
      const ins = new Instrument()
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
      const ins = new Instrument()
      ins.go(index('finland'))
      vi.advanceTimersByTime(GLIDE_MS)
      swipe(ins, -3 * step)
      expect(ins.getSnapshot().chapter).toBe(index('automation'))
      swipe(ins, 2.5 * step)
      expect(ins.getSnapshot().chapter).toBe(index('finland'))
    })

    it('comes back from the first chapter to the cover, and no further', () => {
      const ins = new Instrument()
      ins.go(0)
      vi.advanceTimersByTime(GLIDE_MS)
      swipe(ins, step)
      expect(ins.getSnapshot().chapter).toBe(COVER)
      swipe(ins, step)
      expect(ins.getSnapshot().chapter).toBe(COVER)
      swipe(ins, -step)
      expect(ins.getSnapshot().chapter).toBe(0)
    })

    it('stays put for a finger that goes less than half a sheet and stops', () => {
      const ins = new Instrument()
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
  it('opens on the cover and walks the chapters, no further than either end', () => {
    const ins = new Instrument()
    expect(ins.getSnapshot()).toMatchObject({ chapter: COVER, year: String(LIFE.born) })
    ins.stepBy(-1)
    expect(ins.getSnapshot().chapter).toBe(COVER)
    ins.stepBy(1)
    expect(ins.getSnapshot()).toMatchObject({ chapter: 0, year: String(LIFE.born) })
    ins.stepBy(1)
    expect(ins.getSnapshot()).toMatchObject({ chapter: 1, year: '2008' })
    ins.toLatest()
    ins.stepBy(1)
    expect(ins.getSnapshot().chapter).toBe(latest)
    ins.stepBy(-1)
    expect(ins.getSnapshot().chapter).toBe(latest - 1)
  })
})

describe('picking a sheet', () => {
  it('opens its chapter, and closes it again to the cover', () => {
    const ins = new Instrument()
    ins.pick(index('finland'))
    expect(ins.getSnapshot().chapter).toBe(index('finland'))
    ins.pick(index('automation'))
    expect(ins.getSnapshot().chapter).toBe(index('automation'))
    ins.pick(index('automation'))
    expect(ins.getSnapshot()).toMatchObject({ chapter: COVER, announce: 'Introduction' })
  })

  it('stops Play on the chapter playing, rather than closing it', () => {
    vi.useFakeTimers()
    const ins = new Instrument()
    ins.togglePlay()
    const at = ins.getSnapshot().chapter
    ins.pick(at)
    expect(ins.getSnapshot()).toMatchObject({ chapter: at, playing: false })
    vi.useRealTimers()
  })
})

describe('Play', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Every face is held past 6s and under half a minute: With AI, the longest
  // at 462 of the 500 characters life.test.ts allows a copy, comes to 23.4s.
  it('holds a beat and a glance for every word and every logo, and never past half a minute', () => {
    expect(words('B.Sc. in  Software Engineering, and .NET apps.')).toBe(7)
    const growing = LIFE.chapters[index('growing-up')] as (typeof LIFE.chapters)[number]
    const said = words(`${growing.headline} ${growing.copy}`)
    expect(holdOf(growing)).toBe(HOLD_MS + HOLD_PER_WORD_MS * (said + growing.tools.length))
    for (const hold of LIFE.chapters.map(holdOf)) {
      expect(hold).toBeGreaterThan(6000)
      expect(hold).toBeLessThan(30000)
    }
  })

  it('walks from the cover through every chapter and back to the first, and says nothing on the way', () => {
    const ins = new Instrument()
    ins.togglePlay()
    expect(ins.getSnapshot().chapter).toBe(0)
    const seen: number[] = []
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
    // From the latest, the long way back to the first chapter, never the cover.
    expect(ins.getSnapshot()).toMatchObject({ chapter: 0, playing: true })
    vi.advanceTimersByTime(GLIDE_BACK_MS)
    expect(ins.getSnapshot()).toMatchObject({ chapter: 0, playing: true })
  })

  it('waits while the pointer is on the story, and stops for a step or a scroll', () => {
    const ins = new Instrument()
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
    const ins = new Instrument()
    ins.togglePlay()
    const at = ins.getSnapshot().chapter
    ins.stop()
    expect(ins.getSnapshot()).toMatchObject({ playing: false, chapter: at })
    const before = ins.getSnapshot()
    ins.stop()
    expect(ins.getSnapshot()).toBe(before)
  })
})

describe('Escape', () => {
  it('closes the paper, then goes back to the cover', () => {
    const ins = new Instrument()
    ins.go(index('automation'))
    ins.openPaper()
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, chapter: index('automation') })
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, chapter: COVER })
    expect(ins.getSnapshot().announce).toBe('Introduction')
  })

  it('stops Play on the way back to the cover', () => {
    vi.useFakeTimers()
    const ins = new Instrument()
    ins.togglePlay()
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ playing: false, chapter: COVER })
    vi.useRealTimers()
  })
})
