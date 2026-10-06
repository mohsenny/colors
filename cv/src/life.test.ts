import { describe, expect, it } from 'vitest'
import { LIFE, MOVED, degrees, facts, jobs } from './life'
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

  it('keeps the copy to three sentences under a headline', () => {
    for (const c of LIFE.chapters) expect(c.headline, c.id).not.toBe('')
    for (const text of [LIFE.intro, ...LIFE.chapters.map((c) => c.copy)]) {
      expect(sentences(text), text).toBeGreaterThan(0)
      expect(sentences(text), text).toBeLessThanOrEqual(3)
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
