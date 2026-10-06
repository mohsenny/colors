import { describe, expect, it } from 'vitest'
import page from '../../index.html?raw'

/** The inline script at the top of the root head, the one that runs before anything loads. */
const HEAD = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''

/** Runs it against an address, and says where it sent the page, if anywhere. */
function land(search: string, hash: string): string | null {
  let to: string | null = null
  const location = { search, hash, replace: (url: string) => (to = url) }
  new Function('location', HEAD)(location)
  return to
}

describe('the head script', () => {
  it('is there, in the head, before the page loads anything', () => {
    expect(HEAD).not.toBe('')
    expect(page.indexOf(HEAD)).toBeLessThan(page.indexOf('</head>'))
  })

  it('sends an old Lightbox link on with its seed', () => {
    expect(land('', '#s=abc')).toBe('lightbox/#s=abc')
    expect(land('', '#k=1&s=abc')).toBe('lightbox/#k=1&s=abc')
    expect(land('?a=1', '#s=abc')).toBe('lightbox/?a=1#s=abc')
  })

  it("keeps the CV's own addresses", () => {
    expect(land('', '#text')).toBeNull()
    expect(land('', '#master')).toBeNull()
    expect(land('', '')).toBeNull()
  })
})
