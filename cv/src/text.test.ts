import { describe, expect, it } from 'vitest'
import { LIFE, jobs } from './life'
import { PAPER_ID, closingParts, textCv, titleRow } from './text'

describe('closingParts', () => {
  it('links each instrument from the CV, and nothing else', () => {
    const links = closingParts(LIFE.closing).filter((p) => p.href)
    expect(links).toEqual([
      { text: 'Solar', href: 'solar/' },
      { text: 'Gravity', href: 'gravity/' },
      { text: 'Lightbox', href: 'lightbox/' },
    ])
    expect(closingParts(LIFE.closing).map((p) => p.text).join('')).toBe(LIFE.closing)
  })
})

describe('textCv', () => {
  const html = textCv()

  it('is the paper, ready to move', () => {
    expect(html.startsWith(`<div id="${PAPER_ID}"`)).toBe(true)
  })

  it('lists the jobs newest first', () => {
    const orgs = jobs().map((r) => r.org)
    const at = orgs.map((org) => html.indexOf(org))
    for (const i of at) expect(i).toBeGreaterThan(-1)
    expect(at).toEqual([...at].sort((a, b) => b - a))
  })

  it('links each article, and lists one without a url as plain text', () => {
    for (const w of LIFE.writing) expect(html).toContain(`<a href="${w.url}">`)
    const life = { ...LIFE, writing: [{ title: 'Untitled for now', url: '' }] }
    expect(textCv(life)).toContain('<li>Untitled for now</li>')
  })

  it('escapes what it writes', () => {
    const life = { ...LIFE, intro: 'Q&A <b>' }
    expect(textCv(life)).toContain('Q&amp;A &lt;b&gt;')
  })
})

describe('titleRow', () => {
  it('names the four pages, the CV as the one you are on and the instruments as links', () => {
    const html = titleRow()
    expect(html.startsWith('<noscript>')).toBe(true)
    expect(html).toContain('<span class="lb-title-name" aria-current="page">Mohsen</span>')
    for (const id of ['solar', 'gravity', 'lightbox']) expect(html).toContain(`href="${id}/"`)
  })
})
