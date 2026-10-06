import { filmHex, filmLinear, linearToHex } from '../../../src/core/oklab'
import { filmToRyb, mixFilm } from '../../../src/core/pigment'
import { LIFE } from '../life'
import type { Chapter, Crossing } from '../life'

/*
 * The colours the chrome shows of the life: a chapter's film, and where two
 * cross, the colour the painter mixes there. The card, the chip, the list
 * and the marks on the tape all take them from here.
 */

export function chapterOf(id: string): number {
  return LIFE.chapters.findIndex((c) => c.id === id)
}

export function chapterHex(index: number): string {
  const c = LIFE.chapters[index]
  return c ? filmHex(c.dye) : '#fff'
}

/** The colour two films make where they cross, as the painter mixes it. */
export function crossingHex(x: Crossing): string {
  const films = [x.a, x.b].map((id) => filmLinear((LIFE.chapters[chapterOf(id)] as Chapter).dye))
  const [r, g, b] = mixFilm(films.map(filmToRyb), films)
  return linearToHex(r, g, b)
}
