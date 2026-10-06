import { describe, expect, it } from 'vitest'
import { APPS, hrefOf } from './pages'

/** Every page's folder under the site root, the CV being the root itself. */
const FOLDER = { mohsen: '', lightbox: 'lightbox/', lattice: 'lattice/', solar: 'solar/' } as const

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
    expect(APPS.map((app) => app.name)).toEqual(['Mohsen', 'Lightbox', 'Lattice', 'Solar'])
  })
})
