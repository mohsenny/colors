/*
 * The text CV's line icons, in Icons.tsx's hand: a 14px box, a 1.5 stroke,
 * round ends, no fill. Inner SVG markup, as strings, because text.ts writes
 * the paper before any script runs. The interests are Lucide's (LUCIDE).
 */

export const GLYPHS = {
  mail: '<rect x="1.75" y="3" width="10.5" height="8" rx="1.5"/><path d="m2.5 4.25 4.5 3.25 4.5-3.25"/>',
  briefcase:
    '<rect x="1.75" y="4.25" width="10.5" height="7.5" rx="1.5"/><path d="M5 4.25v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M1.75 7.75h10.5"/>',
  cap: '<path d="M7 2.5 1.25 5.25 7 8l5.75-2.75z"/><path d="M3.75 6.75V9.5c0 .75 1.5 1.75 3.25 1.75s3.25-1 3.25-1.75V6.75M12.75 5.25v3.5"/>',
  team: '<circle cx="5.25" cy="4.5" r="2"/><path d="M1.75 11.75c0-2.1 1.55-3.5 3.5-3.5s3.5 1.4 3.5 3.5"/><path d="M9.25 2.6a2 2 0 0 1 0 3.8M10.5 8.5c1.1.45 1.75 1.6 1.75 3.25"/>',
  wrench:
    '<path d="M8.6 2a3.25 3.25 0 0 0-2.95 4.45L2.1 10a1.35 1.35 0 0 0 1.9 1.9l3.55-3.55A3.25 3.25 0 0 0 12 5.4l-1.9 1.9-2-.4-.4-2L9.6 3z"/>',
  pen: '<path d="M9.25 2.5 11.5 4.75 5 11.25l-3 .75.75-3z"/><path d="m8 3.75 2.25 2.25"/>',
  star: '<path d="M7 1.75c.45 2.75 1.5 3.8 4.25 4.25C8.5 6.45 7.45 7.5 7 10.25 6.55 7.5 5.5 6.45 2.75 6 5.5 5.55 6.55 4.5 7 1.75zM11.25 9.5v3M9.75 11h3"/>',
  pin: '<path d="M7 12.5s4-3.5 4-6.75a4 4 0 0 0-8 0C3 9 7 12.5 7 12.5z"/><circle cx="7" cy="5.75" r="1.4"/>',
} as const

/*
 * Lucide's (lucide.dev, ISC: Copyright (c) for portions of Lucide are held by
 * Cole Bemis 2013-2022 as part of Feather (MIT), and all other copyright by
 * Lucide Contributors 2022), for things a 14px hand draws badly: a 24px box
 * and their own 2 stroke, the same round ends.
 */
const LUCIDE = {
  orbit:
    '<circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 21.9a10 10 0 0 0 9.941-15.416"/><path d="M13.5 2.1a10 10 0 0 0-9.841 15.416"/>',
  atom: '<circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/>',
  dog: '<path d="M11.25 16.25h1.5L12 17z"/><path d="M16 14v.5"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"/><path d="M8 14v.5"/><path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/>',
} as const

export type GlyphId = keyof typeof GLYPHS | keyof typeof LUCIDE

/** A glyph as an SVG element, hidden from a screen reader: what it stands for is said in words beside it. */
export function glyph(id: GlyphId, className = 'cv-glyph'): string {
  const lucide = id in LUCIDE
  const box = lucide ? 24 : 14
  const body = lucide ? LUCIDE[id as keyof typeof LUCIDE] : GLYPHS[id as keyof typeof GLYPHS]
  return `<svg class="${className}" viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="${lucide ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
}
