import { describe, expect, it } from 'vitest'
import {
  SLIDE_COUNT,
  SLIDE_COUNT_MAX,
  SLIDE_COUNT_MIN,
  SLIDE_COUNT_SMALL,
  SMALL_VIEWPORT,
} from '../core/constants'
import { defaultSlideCount, measureViewport, viewportSignificant } from './viewport'

/** The only thing measureViewport asks of the element. */
const stage = (width: number, height: number): HTMLElement =>
  ({ getBoundingClientRect: () => ({ width, height }) }) as unknown as HTMLElement

describe('measureViewport', () => {
  it('lets the viewport choose when nobody has overridden it', () => {
    expect(measureViewport(stage(1440, 900)).slideCount).toBe(SLIDE_COUNT)
    expect(measureViewport(stage(390, 780)).slideCount).toBe(SLIDE_COUNT_SMALL)
  })

  it('takes the count the control asked for', () => {
    expect(measureViewport(stage(1440, 900), 5).slideCount).toBe(5)
    expect(measureViewport(stage(1440, 900), 12).slideCount).toBe(12)
  })

  it('clamps an override rather than refusing it', () => {
    // The stepper should not have to know where the ends are, and neither
    // should a seed in a URL someone hand-edited.
    expect(measureViewport(stage(1440, 900), 0).slideCount).toBe(SLIDE_COUNT_MIN)
    expect(measureViewport(stage(1440, 900), 99).slideCount).toBe(SLIDE_COUNT_MAX)
    expect(measureViewport(stage(1440, 900), 7.4).slideCount).toBe(7)
  })

  it('honours an override on a small screen too', () => {
    // A phone gets fewer sheets by default, not a lower ceiling. If someone
    // opens the drawer and asks for ten, they can see what ten looks like.
    expect(measureViewport(stage(390, 780), 10).slideCount).toBe(10)
  })

  it('agrees with defaultSlideCount about the boundary', () => {
    expect(defaultSlideCount(SMALL_VIEWPORT - 1)).toBe(SLIDE_COUNT_SMALL)
    expect(defaultSlideCount(SMALL_VIEWPORT)).toBe(SLIDE_COUNT)
  })
})

describe('viewportSignificant', () => {
  it('treats a count change as worth a relayout however still the window is', () => {
    const a = measureViewport(stage(1440, 900))
    const b = measureViewport(stage(1440, 900), SLIDE_COUNT + 1)
    expect(viewportSignificant(a, b)).toBe(true)
  })
})
