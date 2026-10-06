/*
 * Earth, Jupiter and the Sun as photographed and stitched by Solar System
 * Scope (CC BY 4.0): Solar's own maps, shared rather than copied. Each is an
 * equirectangular picture: longitude across, the prime meridian in the
 * middle, north at the top.
 */

import earthClouds from '../../../solar/src/assets/earth_clouds.jpg'
import earthDay from '../../../solar/src/assets/earth_daymap.jpg'
import jupiter from '../../../solar/src/assets/jupiter.jpg'
import sun from '../../../solar/src/assets/sun.jpg'

export interface Surface {
  map: string
  /** Cloud over the map, laid on as Solar lays it on the Earth. */
  clouds: string | null
  /** Lit from within, not by the lamps. */
  glow: boolean
  /** The longitude, degrees east, that faces +z. The room opens on the one 35 degrees east of it. */
  face: number
}

/** By preset. Every other body keeps its one colour. */
export const SURFACES: Partial<Record<string, Surface>> = {
  earth: { map: earthDay, clouds: earthClouds, glow: false, face: -50 },
  jupiter: { map: jupiter, clouds: null, glow: false, face: -75 },
  sun: { map: sun, clouds: null, glow: true, face: -100 },
}
