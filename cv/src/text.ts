import { APPS, hrefOf } from '../../src/ui/pages.ts'
import { LIFE, bare, degrees, jobs } from './life.ts'
import type { Life, Role } from './life.ts'

/*
 * The CV as text, built from life.ts. vite.config.ts writes it into
 * index.html, so link previews, crawlers and a browser without script all
 * get it, and the app then moves that same element onto the paper. A string
 * rather than React for that reason: it has to exist before any script runs.
 *
 * The imports carry their extension for the same reason as life.ts's.
 */

/** Where the text CV goes in index.html. */
export const SLOT = '<!-- cv-text -->'

/** The paper's element, for the app to find it by. */
export const PAPER_ID = 'cv-paper'

/** A run of the closing line, linked where it names an instrument. */
export interface Part {
  text: string
  href?: string
}

/** The closing line in runs, each instrument's name a link to it from the CV. */
export function closingParts(text: string): Part[] {
  const names = APPS.filter((app) => app.id !== 'mohsen')
  const pattern = new RegExp(`\\b(${names.map((app) => app.name).join('|')})\\b`)
  const parts: Part[] = []
  for (const [i, run] of text.split(pattern).entries()) {
    if (run === '') continue
    // split with a group puts every match at an odd index.
    const app = i % 2 === 1 ? names.find((a) => a.name === run) : undefined
    parts.push(app ? { text: run, href: hrefOf('mohsen', app.id) } : { text: run })
  }
  return parts
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function link(text: string, href: string): string {
  return `<a href="${esc(href)}">${esc(text)}</a>`
}

/** Dates in mono, as the tabs and the clock have them. */
function when(role: Role): string {
  return `<span class="cv-when">${esc(role.from)} to ${esc(role.to)}</span>`
}

function role(r: Role): string {
  const where = [r.org, r.place].filter(Boolean).join(', ')
  const points = r.points.length > 0 ? `<ul>${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''
  return `<section class="cv-role"><h3>${esc(r.title)}</h3><p class="cv-at">${esc(where)} ${when(r)}</p>${points}</section>`
}

function part(label: string, body: string): string {
  return `<section class="cv-part"><h2>${esc(label)}</h2>${body}</section>`
}

/**
 * The title row as plain links, for a browser without script. With script
 * the app draws its own, and a noscript is never shown beside it.
 */
export function titleRow(): string {
  const names = APPS.map((app) =>
    app.id === 'mohsen'
      ? `<span class="lb-title-name" aria-current="page">${esc(app.name)}</span>`
      : `<a class="lb-title-name" href="${esc(hrefOf('mohsen', app.id))}">${esc(app.name)}</a>`,
  ).join('')
  return `<noscript><nav class="lb-title" aria-label="Pages">${names}</nav></noscript>`
}

/** The whole text CV as HTML: intro, reach, experience newest first, education, skills, writing, outside work, the closing line. */
export function textCv(life: Life = LIFE): string {
  const { reach } = life
  const reachRows = [
    ['Email', link(reach.email, `mailto:${reach.email}`)],
    ['LinkedIn', link(bare(reach.linkedin), reach.linkedin)],
    ['GitHub', link(bare(reach.github), reach.github)],
    ['Medium', link(bare(reach.medium), reach.medium)],
  ]
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('')
  const experience = jobs(life)
    .reverse()
    .map(role)
    .join('')
  const education = degrees(life)
    .reverse()
    .map(role)
    .join('')
  const writing = life.writing
    .map((w) => `<li>${w.url ? link(w.title, w.url) : esc(w.title)}</li>`)
    .join('')
  // The profile first, so the list reads as a sample of it.
  const medium = `<p>${link(bare(reach.medium), reach.medium)}</p>`
  const closing = closingParts(life.closing)
    .map((p) => (p.href ? link(p.text, p.href) : esc(p.text)))
    .join('')
  return [
    `<div id="${PAPER_ID}" class="lb-paper cv-paper is-in">`,
    `<article class="cv-text" tabindex="-1" aria-label="${esc(life.name)}, the CV as text">`,
    `<h1>${esc(life.name)}</h1>`,
    `<p class="cv-intro">${esc(life.intro)}</p>`,
    part('Reach', `<dl class="cv-reach">${reachRows}</dl>`),
    part('Experience', experience),
    part('Education', education),
    part('Skills', `<p>${esc(life.skills)}</p>`),
    part('Writing', `${medium}<ul class="cv-writing">${writing}</ul>`),
    part('Outside work', `<p>${esc(life.outside)}</p>`),
    `<p class="cv-closing">${closing}</p>`,
    '</article>',
    '</div>',
  ].join('')
}
