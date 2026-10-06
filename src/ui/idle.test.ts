import { describe, expect, it } from 'vitest'
import { onlyWakes } from './idle'

/** Just enough of an element for `closest`, inside `[data-awake]` or not. */
function node(awake: boolean): EventTarget {
  const el = { closest: (selectors: string) => (selectors === '[data-awake]' && awake ? {} : null) }
  return el as unknown as EventTarget
}

describe('onlyWakes', () => {
  it('swallows a finger on an idle page', () => {
    expect(onlyWakes('touch', node(false), true, 0)).toBe(true)
  })

  it('lets a finger on data-awake chrome through while the page is idle', () => {
    expect(onlyWakes('touch', node(true), true, 0)).toBe(false)
    expect(onlyWakes('pen', node(true), false, 1)).toBe(false)
  })

  it('swallows a second finger while a waking one is down', () => {
    expect(onlyWakes('touch', node(false), false, 1)).toBe(true)
  })

  it('never swallows a mouse, nor a finger on an awake page', () => {
    expect(onlyWakes('mouse', node(false), true, 1)).toBe(false)
    expect(onlyWakes('touch', node(false), false, 0)).toBe(false)
  })
})
