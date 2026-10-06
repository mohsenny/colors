import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIFE } from '../life'
import {
  GLIDE_MS,
  HOLD_MS,
  HOLD_PER_SENTENCE_MS,
  Instrument,
  SQUEEZE,
  chapterAt,
  crossingId,
  holdOf,
  nearest,
  sentences,
  stopsOf,
  tapeOf,
  yearLabel,
  yearNow,
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
    expect(stops[index('master')]).toBeCloseTo(SQUEEZE + (0.9 * 4) / 18.76, 9)
  })

  it('gives every chapter a stop of its own, in order, two that start in 2024 included', () => {
    for (let i = 1; i < stops.length; i++) expect(stops[i] as number).toBeGreaterThan(stops[i - 1] as number)
    expect(stops[index('with-ai')]).toBeGreaterThan(stops[index('leading-qa')] as number)
    expect(stops[stops.length - 1]).toBeLessThan(1)
  })

  it('reads Iran before 2008, the year after it, and both 2024 stops as 2024', () => {
    expect(yearLabel(0, LIFE, NOW)).toBe('Iran')
    expect(yearLabel(SQUEEZE / 2, LIFE, NOW)).toBe('Iran')
    expect(yearLabel(SQUEEZE, LIFE, NOW)).toBe('2008')
    expect(yearLabel(stops[index('master')] as number, LIFE, NOW)).toBe('2012')
    expect(yearLabel(stops[index('leading-qa')] as number, LIFE, NOW)).toBe('2024')
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
    const arbonaut = stops[index('arbonaut')] as number
    expect(chapterAt(arbonaut - 0.001, stops)).toBe(index('master'))
    expect(chapterAt(arbonaut + 0.001, stops)).toBe(index('arbonaut'))
    expect(chapterAt(0.999, stops)).toBe(index('with-ai'))
    expect(chapterAt(1, stops)).toBe(null)
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
    const berlin = stops[index('berlin')] as number
    const bird = stops[index('messagebird')] as number
    expect(nearest(berlin + (bird - berlin) * 0.4, stops)).toBe(index('berlin'))
    expect(nearest(berlin + (bird - berlin) * 0.6, stops)).toBe(index('messagebird'))
  })

  describe('a scrub', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('moves the chapter as it goes and lands on a stop when it stops', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('berlin'))
      // No stage, so a pixel of wheel is a thousandth of the tape.
      ins.scroll(20)
      expect(ins.getSnapshot().chapter).toBe(index('berlin'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('berlin'))
      ins.scroll(300)
      expect(ins.getSnapshot().chapter).toBe(index('messagebird'))
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(index('messagebird'))
      expect(ins.getSnapshot().year).toBe('2022')
      ins.scroll(1000)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().chapter).toBe(null)
    })

    it('says where it landed once, not while it moved', () => {
      const ins = new Instrument({ now: NOW })
      ins.go(index('master'))
      const said = ins.getSnapshot().announce
      expect(said).toBe("Master's, 2012 to 2015")
      ins.scroll(30)
      expect(ins.getSnapshot().announce).toBe(said)
      vi.advanceTimersByTime(200)
      expect(ins.getSnapshot().announce).toBe('Arbonaut, 2013 to 2015')
    })

    it('says a crossing by its two chapters, and Growing up mid-sentence', () => {
      const ins = new Instrument({ now: NOW })
      ins.goCrossing(0)
      expect(ins.getSnapshot().announce).toBe("Both at once: Master's and Arbonaut")
      ins.go(0)
      expect(ins.getSnapshot().announce).toBe('Growing up, until 2008')
    })

    it('follows the tape while it is dragged and settles only when it is let go', () => {
      const ins = new Instrument({ now: NOW })
      const berlin = stops[index('berlin')] as number
      const bird = stops[index('messagebird')] as number
      ins.scrubTo(berlin + (bird - berlin) * 0.4)
      expect(ins.getSnapshot()).toMatchObject({ chapter: index('berlin'), year: '2018' })
      // A drag held still is still a drag: no timer settles it.
      vi.advanceTimersByTime(5000)
      expect(ins.getSnapshot().announce).toBe('')
      ins.scrubTo(berlin + (bird - berlin) * 0.6)
      ins.scrubEnd()
      vi.advanceTimersByTime(GLIDE_MS)
      expect(ins.getSnapshot()).toMatchObject({ chapter: index('messagebird'), year: '2022' })
      expect(ins.getSnapshot().announce).toBe('MessageBird, 2022 to 2024')
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

  it('puts a crossing up on the later of its two chapters', () => {
    const ins = new Instrument({ now: NOW })
    ins.goCrossing(0)
    expect(ins.getSnapshot().crossing).toBe(0)
    expect(ins.getSnapshot().chapter).toBe(index('arbonaut'))
    ins.go(2)
    expect(ins.getSnapshot().crossing).toBe(null)
  })
})

describe('Play', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds five seconds and one more for each sentence past the first', () => {
    expect(sentences('B.Sc. in Software Engineering at Iran University of Science and Technology.')).toBe(1)
    expect(sentences('Web apps, GIS plugins, and .NET apps for Windows. Then more.')).toBe(2)
    expect(holdOf(LIFE.chapters[index('growing-up')] as (typeof LIFE.chapters)[number])).toBe(HOLD_MS)
    expect(holdOf(LIFE.chapters[index('berlin')] as (typeof LIFE.chapters)[number])).toBe(
      HOLD_MS + HOLD_PER_SENTENCE_MS,
    )
  })

  it('walks from the start through every chapter, ends on Now and says nothing on the way', () => {
    const ins = new Instrument({ now: NOW })
    ins.togglePlay()
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
    expect(ins.getSnapshot().chapter).toBe(null)
    expect(ins.getSnapshot().playing).toBe(false)
  })

  it('waits while the pointer is on the card, and stops for a step or a scroll', () => {
    const ins = new Instrument({ now: NOW })
    ins.togglePlay()
    ins.holdPlay(true)
    vi.advanceTimersByTime(60_000)
    expect(ins.getSnapshot().chapter).toBe(0)
    ins.holdPlay(false)
    vi.advanceTimersByTime(GLIDE_MS + HOLD_MS)
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
    ins.go(index('berlin'))
    ins.openList()
    ins.openPaper()
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, list: true, chapter: index('berlin') })
    ins.escape()
    expect(ins.getSnapshot()).toMatchObject({ paper: false, list: false, chapter: index('berlin') })
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

describe('crossingId', () => {
  it('is lowercase words, unique, and never a chapter or Lightbox seed', () => {
    const ids = LIFE.crossings.map(crossingId)
    expect(ids).toEqual(['master-arbonaut', 'leading-qa-with-ai'])
    for (const id of ids) {
      expect(id).toMatch(/^[a-z-]+$/)
      expect(LIFE.chapters.some((c) => c.id === id)).toBe(false)
    }
  })
})
