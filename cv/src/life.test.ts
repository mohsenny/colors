import { describe, expect, it } from 'vitest'
import { LIFE, MOVED, degrees, facts, jobs, tabOf } from './life'
import { LOGOS } from './logos'

/** Every string in the life, wherever it sits. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** Full stops that end a sentence, not the ones in B.Sc. or .NET. */
function sentences(text: string): number {
  return text.match(/[.!?](?=\s+[A-Z]|$)/g)?.length ?? 0
}

describe('the ship gate', () => {
  // Pages keeps the old site while this fails, so no gap goes out as a
  // placeholder. The list of what is missing is at the top of life.ts.
  it('has no [unknown] left', () => {
    expect(strings(LIFE).filter((s) => s.includes('[unknown'))).toEqual([])
  })
})

describe('the life', () => {
  it('has six chapters with unique ids a hash can carry', () => {
    const ids = LIFE.chapters.map((c) => c.id)
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/)
  })

  it('runs in start order, each chapter ending after it starts', () => {
    const starts = LIFE.chapters.map((c) => c.from).filter((y) => typeof y === 'number')
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    for (const c of LIFE.chapters) {
      if (typeof c.from === 'number' && typeof c.to === 'number') expect(c.to).toBeGreaterThanOrEqual(c.from)
    }
    // Only the first chapter starts from a place rather than a year.
    expect(LIFE.chapters.slice(1).some((c) => c.from === 'Iran')).toBe(false)
  })

  // The tallest face sets where the sheets lie for every chapter, so one long
  // copy shrinks them all. Five sentences and 500 characters is With AI's,
  // the tallest face at 320x568 and on a phone on its side, where it leaves
  // the sheets 111px and 77px: anything longer takes them under.
  it('keeps the copy to five sentences and 500 characters under a headline', () => {
    for (const c of LIFE.chapters) expect(c.headline, c.id).not.toBe('')
    expect(LIFE.cover.headline).not.toBe('')
    for (const text of [LIFE.intro, LIFE.cover.copy, ...LIFE.chapters.map((c) => c.copy)]) {
      expect(sentences(text), text).toBeGreaterThan(0)
      expect(sentences(text), text).toBeLessThanOrEqual(5)
      expect(text.length, text).toBeLessThanOrEqual(500)
    }
  })

  it('has no em or en dash anywhere', () => {
    expect(strings(LIFE).filter((s) => /[\u2013\u2014]/.test(s))).toEqual([])
  })

  it('leans each sheet 1.5 degrees at most', () => {
    for (const c of LIFE.chapters) expect(Math.abs(c.lean)).toBeLessThanOrEqual(1.5)
  })

  it('names only logos there are, each once in a chapter', () => {
    for (const c of LIFE.chapters) {
      const ids = [...c.orgs, ...c.tools]
      expect(new Set(ids).size, c.id).toBe(ids.length)
      for (const id of ids) expect(LOGOS[id], id).toBeDefined()
    }
  })

  it('marks each role with an org of its chapter', () => {
    for (const c of LIFE.chapters) for (const r of c.roles ?? []) expect(c.orgs, r.org).toContain(r.logo)
  })

  it('sets the skills in rows, each mark one there is', () => {
    for (const set of LIFE.skills) {
      expect(set.skills.length, set.label).toBeGreaterThan(0)
      for (const s of set.skills) if (s.logo) expect(LOGOS[s.logo], s.name).toBeDefined()
    }
    expect(LIFE.interests.length).toBeGreaterThan(0)
  })

  it('sends the old chapters and crossings to the chapter that holds them now', () => {
    const ids = new Set(LIFE.chapters.map((c) => c.id))
    for (const [from, to] of Object.entries(MOVED)) {
      expect(ids.has(to), from).toBe(true)
      expect(ids.has(from), from).toBe(false)
    }
  })

  it('tells the jobs from the degrees', () => {
    expect(jobs().map((r) => r.org)).toContain('Arbonaut')
    expect(jobs().every((r) => r.kind === 'job')).toBe(true)
    expect(degrees().map((r) => r.kind)).toEqual(['degree', 'degree'])
  })
})

describe('the tabs', () => {
  // The year each chapter starts, and the country where it opens in a new
  // one, so the moves read along the row.
  it('say the year and, for a move, the country', () => {
    expect(LIFE.chapters.map((c) => tabOf(c))).toEqual([
      { year: 1989, country: 'Iran' },
      { year: 2008 },
      { year: 2012, country: 'Finland' },
      { year: 2016, country: 'Germany' },
      { year: 2018 },
      { year: 2024 },
    ])
  })

  it('start Growing up at the year he was born, as the life has it', () => {
    const life = { ...LIFE, born: 1990 }
    expect(life.chapters.map((c) => tabOf(c, life).year)).toEqual([1990, 2008, 2012, 2016, 2018, 2024])
  })
})

describe('the films', () => {
  // The six sit at 0.5 to 0.55. Lightbox's 0.75 floor is for bare sheets,
  // too dense for the lamp to come through a printed one.
  it('are thin enough for the lamp to come through', () => {
    for (const c of LIFE.chapters) {
      expect(c.dye.d, c.id).toBeGreaterThanOrEqual(0.45)
      expect(c.dye.d, c.id).toBeLessThanOrEqual(0.6)
    }
  })
})

describe('facts', () => {
  it('reads the facts at Now off the chapters', () => {
    const rows = Object.fromEntries(facts().map((f) => [f.label, f.value]))
    expect(rows.Now).toBe('QA Lead, CompuGroup Medical')
    expect(rows.Before).toBe('LucaNet, MessageBird, Talentspace')
    expect(rows.Studied).toBe('M.Sc. Computer Science, Eastern Finland')
    expect(rows.Based).toBe('Germany')
    expect(rows.Reach).toContain('github.com/mohsenny')
  })
})
