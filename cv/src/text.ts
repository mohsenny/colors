import { filmHex } from '../../src/core/oklab.ts'
import { APPS, hrefOf } from '../../src/ui/pages.ts'
import { glyph } from './glyphs.ts'
import type { GlyphId } from './glyphs.ts'
import { LIFE, bare, degrees, facts, jobs } from './life.ts'
import type { Life, Role, Skill } from './life.ts'
import { LOGOS } from './logos.ts'
import type { LogoId } from './logos.ts'

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

/** Read out and printed, not shown: what a mark or a glyph says to the eye. */
function unseen(text: string): string {
  return `<span class="cv-unseen">${esc(text)}</span>`
}

/** A logo at its own optical size, hidden from a screen reader: its name is in words beside it. */
function mark(id: LogoId): string {
  const logo = LOGOS[id]
  const [, , w, h] = logo.viewBox.split(' ').map(Number)
  const style = `--cv-scale:${logo.scale};aspect-ratio:${w} / ${h}`
  return `<svg class="cv-mark is-${logo.kind}" viewBox="${logo.viewBox}" style="${style}" aria-hidden="true" focusable="false">${logo.body}</svg>`
}

/** A section's head: its glyph on the spine's line, its name beside it. */
function head(id: string, label: string, icon: GlyphId): string {
  return `<h2 class="cv-head" id="cv-${id}-head">${glyph(icon, 'cv-head-glyph')}<span>${esc(label)}</span></h2>`
}

function part(id: string, label: string, icon: GlyphId, body: string): string {
  return `<section class="cv-part" id="cv-${id}" tabindex="-1" aria-labelledby="cv-${id}-head">${head(id, label, icon)}${body}</section>`
}

/** The year a role starts, for the side: `Feb 2013` is 2013. */
function yearOf(role: Role): string {
  return role.from.match(/\d{4}/)?.[0] ?? role.from
}

/**
 * A role on the spine: its year down the side, a dot in its chapter's film,
 * then the org's mark and the title, where and when, and what was done. The
 * org's name in words is read out and printed with the title; on screen a
 * wordmark says it, and a mark alone has it over the dates.
 */
function node(r: Role, film: string): string {
  const sep = '<span class="cv-sep" aria-hidden="true">·</span>'
  const org = LOGOS[r.logo].kind === 'mark' ? `<span class="cv-org" aria-hidden="true">${esc(r.org)}</span>${sep}` : ''
  const meta = `${org}${r.place ? `<span class="cv-place">${esc(r.place)}</span>${sep}` : ''}<span class="cv-when">${esc(r.from)} to ${esc(r.to)}</span>`
  const points = r.points.length > 0 ? `<ul class="cv-points">${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''
  return [
    `<li class="cv-node is-${r.kind}" style="--cv-film:${film}">`,
    `<span class="cv-year" aria-hidden="true">${esc(yearOf(r))}</span>`,
    '<div class="cv-node-body">',
    `<h3><span class="cv-brand">${mark(r.logo)}</span>${unseen(`${r.org}, `)}<span class="cv-title">${esc(r.title)}</span></h3>`,
    `<p class="cv-meta">${meta}</p>`,
    points,
    '</div></li>',
  ].join('')
}

/** A skill: its mark and its name, a wordmark alone, or its name alone. */
function chip(s: Skill): string {
  if (!s.logo) return `<li class="cv-chip">${esc(s.name)}</li>`
  const name = LOGOS[s.logo].kind === 'wordmark' ? unseen(s.name) : esc(s.name)
  return `<li class="cv-chip">${mark(s.logo)}${name}</li>`
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

type SectionId = 'experience' | 'education' | 'skills' | 'writing' | 'outside'

/** The sections in the order they are read, for the index too. */
const SECTIONS: { id: SectionId; label: string; icon: GlyphId }[] = [
  { id: 'experience', label: 'Experience', icon: 'briefcase' },
  { id: 'education', label: 'Education', icon: 'cap' },
  { id: 'skills', label: 'Skills', icon: 'wrench' },
  { id: 'writing', label: 'Writing', icon: 'pen' },
  { id: 'outside', label: 'Outside work', icon: 'star' },
]

/** The marks the glance leads with: the tools most of the work was done in. */
const MAIN_TOOLS: LogoId[] = ['cypress', 'webdriverio', 'selenium', 'k6', 'python', 'grafana', 'claude']

/** The glance's rows: a glyph, a label and what it says. */
function glance(life: Life): string {
  const fact = (label: string): string => facts(life).find((f) => f.label === label)?.value ?? ''
  const leading = life.chapters.find((c) => c.id === 'leading-qa')
  const study = degrees(life).at(-1)
  const tools = MAIN_TOOLS.map((id) => `<li>${mark(id)}${unseen(LOGOS[id].name)}</li>`).join('')
  const rows: [GlyphId, string, string][] = [
    ...(leading ? [['team', leading.name, `Since ${leading.from}`] as [GlyphId, string, string]] : []),
    ...(study ? [['cap', 'Studied', `${mark(study.logo)}${esc(fact('Studied'))}`] as [GlyphId, string, string]] : []),
    ['wrench', 'Main tools', `<ul class="cv-tools">${tools}</ul>`],
  ]
  return rows.map(([icon, label, value]) => `<div><dt>${glyph(icon)}${esc(label)}</dt><dd>${value}</dd></div>`).join('')
}

/** The ways to reach him, each its mark alone on screen, its address in the link's name and in print. */
function ways(life: Life): string {
  const { reach } = life
  return [
    { label: 'Email', at: reach.email, href: `mailto:${reach.email}`, icon: glyph('mail', 'cv-way-glyph') },
    { label: 'LinkedIn', at: bare(reach.linkedin), href: reach.linkedin, icon: mark('linkedin') },
    { label: 'GitHub', at: bare(reach.github), href: reach.github, icon: mark('github') },
    { label: 'Medium', at: bare(reach.medium), href: reach.medium, icon: mark('medium') },
  ]
    .map(
      (w) =>
        `<li><a class="cv-way" href="${esc(w.href)}" aria-label="${w.label}, ${esc(w.at)}" title="${esc(w.at)}">${w.icon}<span class="cv-way-at">${esc(w.at)}</span></a></li>`,
    )
    .join('')
}

/**
 * The whole text CV as HTML. First the glance: the name, the job now, the
 * ways to reach him, the intro, how long he has led QA, where he studied and
 * the main tools. Then an index, the spine of years with the jobs newest first
 * and the degrees under them, the skills, the writing, outside work and the
 * closing line.
 */
export function textCv(life: Life = LIFE): string {
  const film = new Map(life.chapters.flatMap((c) => (c.roles ?? []).map((r) => [r, filmHex(c.dye)] as const)))
  const spine = (roles: Role[]): string =>
    `<ol class="cv-spine">${roles.map((r) => node(r, film.get(r) ?? 'currentColor')).join('')}</ol>`
  const skills = life.skills
    .map((set) => `<div><dt>${esc(set.label)}</dt><dd><ul class="cv-chips">${set.skills.map(chip).join('')}</ul></dd></div>`)
    .join('')
  const writing = life.writing.map((w) => `<li>${w.url ? link(w.title, w.url) : esc(w.title)}</li>`).join('')
  // The profile first, so the list reads as a sample of it.
  const medium = `<p class="cv-profile"><a href="${esc(life.reach.medium)}">${mark('medium')}${esc(bare(life.reach.medium))}</a></p>`
  const interests = life.interests.map((i) => `<li>${glyph(i.glyph)}<span>${esc(i.text)}</span></li>`).join('')
  const body: Record<SectionId, string> = {
    experience: spine(jobs(life).reverse()),
    education: spine(degrees(life).reverse()),
    skills: `<dl class="cv-skills">${skills}</dl>`,
    writing: `${medium}<ul class="cv-writing">${writing}</ul>`,
    outside: `<ul class="cv-interests">${interests}</ul>`,
  }
  const parts = SECTIONS.map((s) => part(s.id, s.label, s.icon, body[s.id]))
  const index = SECTIONS.map((s) => `<li><a href="#cv-${s.id}">${glyph(s.icon)}<span>${esc(s.label)}</span></a></li>`).join('')
  const closing = closingParts(life.closing)
    .map((p) => (p.href ? link(p.text, p.href) : esc(p.text)))
    .join('')
  return [
    `<div id="${PAPER_ID}" class="lb-paper cv-paper is-in">`,
    `<article class="cv-text" tabindex="-1" aria-label="${esc(life.name)}, the CV as text">`,
    '<header class="cv-hero">',
    `<h1>${esc(life.name)}</h1>`,
    `<p class="cv-now">${esc(life.role)}</p>`,
    `<ul class="cv-reach" aria-label="Reach">${ways(life)}</ul>`,
    `<p class="cv-intro">${esc(life.intro)}</p>`,
    `<dl class="cv-glance">${glance(life)}</dl>`,
    '</header>',
    `<nav class="cv-index" aria-label="Sections"><ul>${index}</ul></nav>`,
    // Experience and Education hang on one spine.
    `<div class="cv-timeline">${parts.slice(0, 2).join('')}</div>`,
    ...parts.slice(2),
    `<p class="cv-closing">${closing}</p>`,
    '</article>',
    '</div>',
  ].join('')
}
