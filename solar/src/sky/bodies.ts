/*
 * The Sun, the eight planets and Pluto, the Moon, Mars's two moons, the moons
 * of Jupiter and Saturn from the round ones to the small and far ones, five
 * round and one small of Uranus, three of Neptune and Pluto's five, at their
 * real sizes. Radii are the IAU 2015 equatorial ones for the Sun and the
 * planets, with the flattening that makes the giants visibly squat, and mean
 * ones for Pluto and the moons, in km. The small moons are drawn in their
 * real shapes (shapes.ts), scaled to their mean radius.
 */

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'phobos'
  | 'deimos'
  | 'jupiter'
  | 'metis'
  | 'adrastea'
  | 'amalthea'
  | 'thebe'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'himalia'
  | 'saturn'
  | 'pan'
  | 'daphnis'
  | 'atlas'
  | 'prometheus'
  | 'pandora'
  | 'epimetheus'
  | 'janus'
  | 'mimas'
  | 'enceladus'
  | 'tethys'
  | 'telesto'
  | 'calypso'
  | 'dione'
  | 'helene'
  | 'rhea'
  | 'titan'
  | 'hyperion'
  | 'iapetus'
  | 'phoebe'
  | 'uranus'
  | 'puck'
  | 'miranda'
  | 'ariel'
  | 'umbriel'
  | 'titania'
  | 'oberon'
  | 'neptune'
  | 'proteus'
  | 'triton'
  | 'nereid'
  | 'pluto'
  | 'charon'
  | 'styx'
  | 'nix'
  | 'kerberos'
  | 'hydra'

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon'

export interface Body {
  id: BodyId
  name: string
  kind: BodyKind
  /** Equatorial radius, km. */
  radius: number
  /** For a lumpy moon, how far out its highest point is, km. */
  outer?: number
  /** 1 - polar / equatorial. */
  flat: number
  /** For the chip and the marker, sampled off its map. */
  color: string
  /** How far the haze reaches above the surface, in radii, and its colour by day. */
  air?: { depth: number; tint: readonly [number, number, number] }
  /** The planet a moon goes round. */
  parent?: BodyId
}

/** Sun first, then outward, each moon after its planet, nearest first. */
export const BODIES: readonly Body[] = [
  { id: 'sun', name: 'Sun', kind: 'star', radius: 695_700, flat: 0, color: '#f4a63a' },
  { id: 'mercury', name: 'Mercury', kind: 'planet', radius: 2_440.5, flat: 0, color: '#9c948c' },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    radius: 6_051.8,
    flat: 0,
    color: '#dcc596',
    air: { depth: 0.035, tint: [1, 0.86, 0.6] },
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'planet',
    radius: 6_378.137,
    flat: 1 / 298.257,
    color: '#4f7fb8',
    air: { depth: 0.014, tint: [0.32, 0.56, 1] },
  },
  { id: 'moon', name: 'Moon', kind: 'moon', radius: 1_737.4, flat: 0, color: '#a8a49e', parent: 'earth' },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    radius: 3_396.19,
    flat: 0.00589,
    color: '#c1683f',
    air: { depth: 0.008, tint: [0.95, 0.62, 0.42] },
  },
  { id: 'phobos', name: 'Phobos', kind: 'moon', radius: 11.08, outer: 13.8, flat: 0, color: '#5b524c', parent: 'mars' },
  { id: 'deimos', name: 'Deimos', kind: 'moon', radius: 6.2, outer: 8.5, flat: 0, color: '#655950', parent: 'mars' },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', radius: 71_492, flat: 0.06487, color: '#c9a682' },
  { id: 'metis', name: 'Metis', kind: 'moon', radius: 21.5, outer: 29.7, flat: 0, color: '#8b7366', parent: 'jupiter' },
  { id: 'adrastea', name: 'Adrastea', kind: 'moon', radius: 8.2, outer: 10, flat: 0, color: '#8b7366', parent: 'jupiter' },
  { id: 'amalthea', name: 'Amalthea', kind: 'moon', radius: 83.5, outer: 146.7, flat: 0, color: '#a5583d', parent: 'jupiter' },
  { id: 'thebe', name: 'Thebe', kind: 'moon', radius: 49.3, outer: 61.3, flat: 0, color: '#8f6a55', parent: 'jupiter' },
  { id: 'io', name: 'Io', kind: 'moon', radius: 1_821.6, flat: 0, color: '#c4a670', parent: 'jupiter' },
  { id: 'europa', name: 'Europa', kind: 'moon', radius: 1_560.8, flat: 0, color: '#c6bbaf', parent: 'jupiter' },
  { id: 'ganymede', name: 'Ganymede', kind: 'moon', radius: 2_631.2, flat: 0, color: '#8a8477', parent: 'jupiter' },
  { id: 'callisto', name: 'Callisto', kind: 'moon', radius: 2_410.3, flat: 0, color: '#615b54', parent: 'jupiter' },
  { id: 'himalia', name: 'Himalia', kind: 'moon', radius: 85, outer: 98.6, flat: 0, color: '#77736e', parent: 'jupiter' },
  { id: 'saturn', name: 'Saturn', kind: 'planet', radius: 60_268, flat: 0.09796, color: '#d9c18e' },
  { id: 'pan', name: 'Pan', kind: 'moon', radius: 14, outer: 20.8, flat: 0, color: '#c9c2b5', parent: 'saturn' },
  { id: 'daphnis', name: 'Daphnis', kind: 'moon', radius: 3.9, outer: 5.6, flat: 0, color: '#c7c0b3', parent: 'saturn' },
  { id: 'atlas', name: 'Atlas', kind: 'moon', radius: 15.1, outer: 24.3, flat: 0, color: '#c6beb1', parent: 'saturn' },
  { id: 'prometheus', name: 'Prometheus', kind: 'moon', radius: 43.1, outer: 73.1, flat: 0, color: '#c4c2bd', parent: 'saturn' },
  { id: 'pandora', name: 'Pandora', kind: 'moon', radius: 40.6, outer: 57.4, flat: 0, color: '#c6c4bf', parent: 'saturn' },
  { id: 'epimetheus', name: 'Epimetheus', kind: 'moon', radius: 58.2, outer: 74.8, flat: 0, color: '#c8c6c1', parent: 'saturn' },
  { id: 'janus', name: 'Janus', kind: 'moon', radius: 89.2, outer: 106.9, flat: 0, color: '#cbcac6', parent: 'saturn' },
  { id: 'mimas', name: 'Mimas', kind: 'moon', radius: 198.2, flat: 0, color: '#b3b2b0', parent: 'saturn' },
  { id: 'enceladus', name: 'Enceladus', kind: 'moon', radius: 252.1, flat: 0, color: '#d3d5da', parent: 'saturn' },
  { id: 'tethys', name: 'Tethys', kind: 'moon', radius: 531.1, flat: 0, color: '#cbcac8', parent: 'saturn' },
  { id: 'telesto', name: 'Telesto', kind: 'moon', radius: 12.4, outer: 17.1, flat: 0, color: '#d5d5d3', parent: 'saturn' },
  { id: 'calypso', name: 'Calypso', kind: 'moon', radius: 9.5, outer: 16.4, flat: 0, color: '#dadbde', parent: 'saturn' },
  { id: 'dione', name: 'Dione', kind: 'moon', radius: 561.4, flat: 0, color: '#b7b6b5', parent: 'saturn' },
  { id: 'helene', name: 'Helene', kind: 'moon', radius: 18, outer: 21.6, flat: 0, color: '#d8d9dc', parent: 'saturn' },
  { id: 'rhea', name: 'Rhea', kind: 'moon', radius: 763.8, flat: 0, color: '#b6b2ab', parent: 'saturn' },
  {
    id: 'titan',
    name: 'Titan',
    kind: 'moon',
    radius: 2_574.7,
    flat: 0,
    color: '#c99a55',
    air: { depth: 0.1, tint: [1, 0.66, 0.3] },
    parent: 'saturn',
  },
  { id: 'hyperion', name: 'Hyperion', kind: 'moon', radius: 135, outer: 182.7, flat: 0, color: '#b39b7c', parent: 'saturn' },
  { id: 'iapetus', name: 'Iapetus', kind: 'moon', radius: 734.5, flat: 0, color: '#8f7d6c', parent: 'saturn' },
  { id: 'phoebe', name: 'Phoebe', kind: 'moon', radius: 106.5, outer: 120.4, flat: 0, color: '#4a4440', parent: 'saturn' },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    radius: 25_559,
    flat: 0.02293,
    color: '#a3d6dd',
    air: { depth: 0.02, tint: [0.6, 0.85, 0.9] },
  },
  { id: 'puck', name: 'Puck', kind: 'moon', radius: 81, flat: 0, color: '#6a6967', parent: 'uranus' },
  { id: 'miranda', name: 'Miranda', kind: 'moon', radius: 235.8, flat: 0, color: '#8d8b88', parent: 'uranus' },
  { id: 'ariel', name: 'Ariel', kind: 'moon', radius: 578.9, flat: 0, color: '#93918e', parent: 'uranus' },
  { id: 'umbriel', name: 'Umbriel', kind: 'moon', radius: 584.7, flat: 0, color: '#616160', parent: 'uranus' },
  { id: 'titania', name: 'Titania', kind: 'moon', radius: 788.9, flat: 0, color: '#78746d', parent: 'uranus' },
  { id: 'oberon', name: 'Oberon', kind: 'moon', radius: 761.4, flat: 0, color: '#777067', parent: 'uranus' },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    radius: 24_764,
    flat: 0.01708,
    color: '#5578d6',
    air: { depth: 0.02, tint: [0.4, 0.55, 1] },
  },
  { id: 'proteus', name: 'Proteus', kind: 'moon', radius: 208, outer: 240.1, flat: 0, color: '#6f6b67', parent: 'neptune' },
  { id: 'triton', name: 'Triton', kind: 'moon', radius: 1_353.4, flat: 0, color: '#9b8f84', parent: 'neptune' },
  { id: 'nereid', name: 'Nereid', kind: 'moon', radius: 170, flat: 0, color: '#8a8885', parent: 'neptune' },
  { id: 'pluto', name: 'Pluto', kind: 'dwarf', radius: 1_188.3, flat: 0, color: '#c9a383' },
  { id: 'charon', name: 'Charon', kind: 'moon', radius: 606, flat: 0, color: '#8f8b88', parent: 'pluto' },
  { id: 'styx', name: 'Styx', kind: 'moon', radius: 5.2, outer: 7.9, flat: 0, color: '#cfcecb', parent: 'pluto' },
  { id: 'nix', name: 'Nix', kind: 'moon', radius: 18, outer: 23.3, flat: 0, color: '#d0cecb', parent: 'pluto' },
  { id: 'kerberos', name: 'Kerberos', kind: 'moon', radius: 6, outer: 11.4, flat: 0, color: '#c9c8c5', parent: 'pluto' },
  { id: 'hydra', name: 'Hydra', kind: 'moon', radius: 18.5, outer: 28.7, flat: 0, color: '#dcdcda', parent: 'pluto' },
]

/** The eleven with a row of their own in the drawer and a key: the Sun S, then 1 Mercury to 0 Pluto. The other moons ride under what they go round. */
export const KEYED: readonly Body[] = BODIES.filter((b) => !b.parent || b.parent === 'earth')

const BY_ID = new Map(BODIES.map((b) => [b.id, b]))

export function bodyById(id: string): Body | undefined {
  return BY_ID.get(id as BodyId)
}

/** Saturn's rings, inner and outer edge in km: the C ring to the edge of the A ring. */
export const RINGS = { inner: 74_658, outer: 136_775 } as const

export const AU_KM = 149_597_870.7
export const LIGHT_KM_S = 299_792.458
