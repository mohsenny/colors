/*
 * The surface of every body, as photographed and stitched by Solar System
 * Scope (CC BY 4.0), and the catalogue the stars are drawn from. Each map is
 * an equirectangular picture: longitude across, the prime meridian in the
 * middle, north at the top.
 */

import type { BodyId } from '../sky/bodies'
import earthClouds from '../assets/earth_clouds.jpg'
import earthDay from '../assets/earth_daymap.jpg'
import earthNight from '../assets/earth_nightmap.jpg'
import jupiter from '../assets/jupiter.jpg'
import mars from '../assets/mars.jpg'
import mercury from '../assets/mercury.jpg'
import moon from '../assets/moon.jpg'
import neptune from '../assets/neptune.jpg'
import saturn from '../assets/saturn.jpg'
import saturnRing from '../assets/saturn_ring.png'
import sun from '../assets/sun.jpg'
import uranus from '../assets/uranus.jpg'
import venus from '../assets/venus_atmosphere.jpg'
import stars from '../assets/stars.bin?url'

export const SURFACE: Record<BodyId, string> = {
  sun,
  mercury,
  venus,
  earth: earthDay,
  moon,
  mars,
  jupiter,
  saturn,
  uranus,
  neptune,
}

export const EARTH_NIGHT = earthNight
export const EARTH_CLOUDS = earthClouds
export const SATURN_RING = saturnRing
export const STARS = stars

export const CREDIT = 'Maps: Solar System Scope, CC BY 4.0. Stars: Yale Bright Star Catalogue.'
