/*
 * The text CV's line icons, in Icons.tsx's hand: a 14px box, a 1.5 stroke,
 * round ends, no fill. Inner SVG markup, as strings, because text.ts writes
 * the paper before any script runs.
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
  orbit: '<circle cx="7" cy="7" r="2.25"/><ellipse cx="7" cy="7" rx="5.75" ry="2.25" transform="rotate(-30 7 7)"/>',
  wave: '<path d="M1.25 7c1.45-3.25 2.85-3.25 4.25 0s2.8 3.25 4.25 0c.75-1.65 1.75-2.4 3-2.25"/>',
  paw: '<ellipse cx="7" cy="9.4" rx="2.6" ry="2.1"/><circle cx="3.1" cy="6.4" r="1.05"/><circle cx="5.4" cy="3.6" r="1.05"/><circle cx="8.6" cy="3.6" r="1.05"/><circle cx="10.9" cy="6.4" r="1.05"/>',
  pin: '<path d="M7 12.5s4-3.5 4-6.75a4 4 0 0 0-8 0C3 9 7 12.5 7 12.5z"/><circle cx="7" cy="5.75" r="1.4"/>',
} as const

export type GlyphId = keyof typeof GLYPHS

/** A glyph as an SVG element, hidden from a screen reader: what it stands for is said in words beside it. */
export function glyph(id: GlyphId, className = 'cv-glyph'): string {
  return `<svg class="${className}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[id]}</svg>`
}
