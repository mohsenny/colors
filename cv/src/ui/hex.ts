import { filmHex } from '../../../src/core/oklab'
import { LIFE } from '../life'

/*
 * The colour the chrome shows of a chapter: its film. The chip, the list and
 * the marks on the tape all take it from here.
 */

export function chapterHex(index: number): string {
  const c = LIFE.chapters[index]
  return c ? filmHex(c.dye) : '#fff'
}
