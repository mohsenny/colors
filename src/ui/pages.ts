/** The four pages, in the order the title row names them. */
export type App = 'mohsen' | 'solar' | 'gravity' | 'lightbox'

export const APPS: ReadonlyArray<{ id: App; name: string }> = [
  { id: 'mohsen', name: 'Mohsen' },
  { id: 'solar', name: 'Solar' },
  { id: 'gravity', name: 'Gravity' },
  { id: 'lightbox', name: 'Lightbox' },
]

/** Where another page lives, seen from this one: the CV at the root, the instruments a folder down. */
export function hrefOf(from: App, to: App): string {
  return (from === 'mohsen' ? '' : '../') + (to === 'mohsen' ? '' : `${to}/`)
}
