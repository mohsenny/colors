import { describe, expect, it } from 'vitest'
import { LIFE, bare, degrees, jobs } from './life'
import { PAPER_ID, closingParts, copyParts, orgParts, textCv, titleRow } from './text'

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

describe('orgParts', () => {
  const copy = (id: string): string => LIFE.chapters.find((c) => c.id === id)?.copy ?? ''

  it('links each company with a site, by its full name or its short one', () => {
    const named = (id: string): string[] => orgParts(copy(id)).flatMap((p) => (p.href ? [p.text] : []))
    expect(named('finland')).toEqual(['University of Eastern Finland', 'Arbonaut'])
    expect(named('leading-qa')).toEqual(['OSRAM', 'HeyJobs', 'MessageBird', 'LucaNet', 'CompuGroup Medical'])
    expect(named('with-ai')).toEqual(['CGM'])
  })

  it('keeps every word of the copy, and links only to https', () => {
    for (const c of LIFE.chapters) {
      const parts = orgParts(c.copy)
      expect(parts.map((p) => p.text).join('')).toBe(c.copy)
      for (const p of parts) if (p.href) expect(p.href.startsWith('https://')).toBe(true)
    }
  })
})

describe('copyParts', () => {
  it('links the orgs out and the instruments in, and keeps every word', () => {
    const ai = LIFE.chapters.find((c) => c.id === 'with-ai')?.copy ?? ''
    expect(copyParts(ai).filter((p) => p.href && !p.href.startsWith('https://'))).toEqual([
      { text: 'Solar', href: 'solar/' },
      { text: 'Gravity', href: 'gravity/' },
      { text: 'Lightbox', href: 'lightbox/' },
    ])
    expect(copyParts(ai).filter((p) => p.href?.startsWith('https://')).map((p) => p.text)).toEqual(['CGM'])
    for (const text of [LIFE.cover.copy, ...LIFE.chapters.map((c) => c.copy)]) {
      expect(copyParts(text).map((p) => p.text).join('')).toBe(text)
    }
    expect(copyParts(LIFE.cover.copy).filter((p) => p.href).map((p) => p.text)).toEqual(['CompuGroup Medical'])
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

  it('names each org in words beside its mark', () => {
    for (const r of [...jobs(), ...degrees()]) expect(html).toContain(`<span class="cv-unseen">${r.org}, </span>`)
  })

  it('says each address, though the screen shows only its mark', () => {
    const { email, linkedin, github, medium } = LIFE.reach
    for (const at of [email, bare(linkedin), bare(github), bare(medium)]) {
      expect(html).toContain(`, ${at}" title="${at}">`)
      expect(html).toContain(`<span class="cv-way-at">${at}</span>`)
    }
  })

  it('has a part for each place the index jumps to', () => {
    const index = html.slice(html.indexOf('<nav class="cv-index"'), html.indexOf('</nav>', html.indexOf('<nav class="cv-index"')))
    const ids = [...index.matchAll(/href="#(cv-[a-z]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(5)
    for (const id of ids) expect(html).toContain(`<section class="cv-part" id="${id}"`)
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
