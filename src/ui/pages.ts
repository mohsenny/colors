/** The four pages, in the order the title row names them. */
export type App = 'mohsen' | 'solar' | 'gravity' | 'lightbox'

/** Each with the line that says what it is, shown under the row while its name is pointed at. */
export const APPS: ReadonlyArray<{ id: App; name: string; line: string }> = [
  { id: 'mohsen', name: 'Mohsen', line: 'My CV, told in six chapters' },
  { id: 'solar', name: 'Solar', line: 'The solar system at true scale, seen from any planet or moon' },
  { id: 'gravity', name: 'Gravity', line: 'Gravity in 3D: a mass pulling in a net of rubber ropes' },
  { id: 'lightbox', name: 'Lightbox', line: 'Coloured film on a light table, mixing colours nobody chose' },
]

/** Where another page lives, seen from this one: the CV at the root, the instruments a folder down. */
export function hrefOf(from: App, to: App): string {
  return (from === 'mohsen' ? '' : '../') + (to === 'mohsen' ? '' : `${to}/`)
}
