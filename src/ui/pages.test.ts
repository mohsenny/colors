import { describe, expect, it } from 'vitest'
import { APPS, hrefOf } from './pages'

/** Every page's folder under the site root, the CV being the root itself. */
const FOLDER = { mohsen: '', solar: 'solar/', gravity: 'gravity/', lightbox: 'lightbox/' } as const

describe('hrefOf', () => {
  for (const from of APPS) {
    for (const to of APPS) {
      it(`${from.id} to ${to.id} lands on ${to.id}`, () => {
        const site = 'https://mohsenny.github.io/whoami/'
        const here = new URL(FOLDER[from.id], site)
        expect(new URL(hrefOf(from.id, to.id), here).href).toBe(new URL(FOLDER[to.id], site).href)
      })
    }
  }

  it('names the CV first', () => {
    expect(APPS.map((app) => app.name)).toEqual(['Mohsen', 'Solar', 'Gravity', 'Lightbox'])
  })
})

describe('the lines under the title', () => {
  for (const app of APPS) {
    it(`say what ${app.id} is, short and without a dash`, () => {
      expect(app.line.trim()).not.toBe('')
      expect(app.line.length).toBeLessThanOrEqual(60)
      // The en and the em dash, and a hyphen spaced out to stand in for one.
      expect(app.line).not.toMatch(/[\u2013\u2014]| - /)
    })
  }
})
