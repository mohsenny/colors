/** The four pages, in the order the title row names them. */
export type App = 'mohsen' | 'lightbox' | 'lattice' | 'solar'

export const APPS: ReadonlyArray<{ id: App; name: string }> = [
  { id: 'mohsen', name: 'Mohsen' },
  { id: 'lightbox', name: 'Lightbox' },
  { id: 'lattice', name: 'Lattice' },
  { id: 'solar', name: 'Solar' },
]

/** Where another page lives, seen from this one: the CV at the root, the instruments a folder down. */
export function hrefOf(from: App, to: App): string {
  return (from === 'mohsen' ? '' : '../') + (to === 'mohsen' ? '' : `${to}/`)
}
