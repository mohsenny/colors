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
  it('leave the CV to its name', () => {
    expect(APPS.find((app) => app.id === 'mohsen')?.line).toBeUndefined()
  })

  for (const app of APPS.filter((a) => a.id !== 'mohsen')) {
    it(`say what ${app.id} is, short and without a dash`, () => {
      const line = app.line ?? ''
      expect(line.trim()).not.toBe('')
      expect(line.length).toBeLessThanOrEqual(60)
      // The en and the em dash, and a hyphen spaced out to stand in for one.
      expect(line).not.toMatch(/[\u2013\u2014]| - /)
    })
  }
})
