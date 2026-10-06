import { describe, expect, it } from 'vitest'
import { DENSITY_MIN } from '../../src/core/constants'
import { filmLinear, linearToOklch } from '../../src/core/oklab'
import { filmToRyb, mixFilm } from '../../src/core/pigment'
import type { Dye } from '../../src/core/types'
import { LIFE, facts } from './life'
import type { Chapter } from './life'

/**
 * How far a crossing has to land from each of its sheets, in OKLab. The
 * palette's scorer stops paying for separation between two sheets at 0.082;
 * a crossing has to read as a third colour rather than a shade of either, so
 * it is asked for a little more. The chosen roll clears 0.17.
 */
const CLEAR = 0.1

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

function lab(rgb: readonly number[]): [number, number, number] {
  const o = linearToOklch(rgb[0] as number, rgb[1] as number, rgb[2] as number)
  const h = (o.h * Math.PI) / 180
  return [o.L, o.C * Math.cos(h), o.C * Math.sin(h)]
}

function apart(a: readonly number[], b: readonly number[]): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function chapter(id: string): Chapter {
  const found = LIFE.chapters.find((c) => c.id === id)
  if (!found) throw new Error(`no chapter ${id}`)
  return found
}

describe('the ship gate', () => {
  // Pages keeps the old site while this fails, so no gap goes out as a
  // placeholder. The list of what is missing is at the top of life.ts.
  it('has no [unknown] left', () => {
    expect(strings(LIFE).filter((s) => s.includes('[unknown'))).toEqual([])
  })
})

describe('the life', () => {
  it('has unique ids a hash can carry', () => {
    const ids = LIFE.chapters.map((c) => c.id)
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

  it('has four chapters on each row', () => {
    expect(LIFE.chapters.filter((c) => c.row === 'learn')).toHaveLength(4)
    expect(LIFE.chapters.filter((c) => c.row === 'work')).toHaveLength(4)
  })

  it('keeps the copy to two sentences', () => {
    for (const text of [LIFE.intro, ...LIFE.chapters.map((c) => c.copy), ...LIFE.crossings.map((x) => x.copy)]) {
      expect(sentences(text), text).toBeGreaterThan(0)
      expect(sentences(text), text).toBeLessThanOrEqual(2)
    }
  })

  it('has no em or en dash anywhere', () => {
    expect(strings(LIFE).filter((s) => /[\u2013\u2014]/.test(s))).toEqual([])
  })

  it('leans each sheet 1.5 degrees at most', () => {
    for (const c of LIFE.chapters) expect(Math.abs(c.lean)).toBeLessThanOrEqual(1.5)
  })
})

describe('the films', () => {
  it('are all at or above the density floor', () => {
    for (const c of LIFE.chapters) expect(c.dye.d, c.id).toBeGreaterThanOrEqual(DENSITY_MIN)
  })

  it('cross only between the two rows, as a colour clearly unlike either sheet', () => {
    for (const x of LIFE.crossings) {
      const a = chapter(x.a)
      const b = chapter(x.b)
      expect(a.row).not.toBe(b.row)
      const films = [a.dye, b.dye].map((d: Dye) => filmLinear(d))
      const mix = mixFilm(films.map(filmToRyb), films)
      for (const film of films) expect(apart(mix, film), x.name).toBeGreaterThanOrEqual(CLEAR)
    }
  })
})

describe('facts', () => {
  it('reads the card at Now off the chapters', () => {
    const rows = Object.fromEntries(facts().map((f) => [f.label, f.value]))
    expect(rows.Now).toBe('QA Lead, CompuGroup Medical')
    expect(rows.Before).toBe('LucaNet, MessageBird, Talentspace')
    expect(rows.Studied).toBe('M.Sc. Computer Science, Eastern Finland')
    expect(rows.Based).toBe('Germany')
    expect(rows.Reach).toContain('github.com/mohsenny')
  })
})
