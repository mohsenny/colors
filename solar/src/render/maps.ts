/*
 * The surface of every body, as photographed and stitched by Solar System
 * Scope (CC BY 4.0), the round moons of Jupiter and Saturn from the Voyager,
 * Galileo and Cassini mosaics of NASA, JPL and the USGS, the moons of Uranus
 * and Triton from the Voyager 2 mosaics of NASA, JPL and the USGS, Pluto and
 * Charon from the New Horizons mosaics of NASA, JHUAPL and SwRI, and the
 * catalogue the stars are drawn from. Each map is an equirectangular picture:
 * longitude across, the prime meridian in the middle, north at the top.
 * Titan's ground is hidden under its haze, so it has none, and nor do the
 * small moons, which show as their colour. New Horizons saw neither Pluto
 * nor Charon south of about 30° S, and Voyager 2 little of the moons of
 * Uranus or of Triton north of their equators, so there theirs are filled
 * smoothly from the colours round it. Pluto's is graded to its
 * true-colour picture, and Triton's from Voyager's green to its pinkish white.
 */

import type { BodyId } from '../sky/bodies'
import ariel from '../assets/ariel.jpg'
import callisto from '../assets/callisto.jpg'
import charon from '../assets/charon.jpg'
import dione from '../assets/dione.jpg'
import earthClouds from '../assets/earth_clouds.jpg'
import earthDay from '../assets/earth_daymap.jpg'
import earthNight from '../assets/earth_nightmap.jpg'
import enceladus from '../assets/enceladus.jpg'
import europa from '../assets/europa.jpg'
import ganymede from '../assets/ganymede.jpg'
import iapetus from '../assets/iapetus.jpg'
import io from '../assets/io.jpg'
import jupiter from '../assets/jupiter.jpg'
import mars from '../assets/mars.jpg'
import mercury from '../assets/mercury.jpg'
import mimas from '../assets/mimas.jpg'
import miranda from '../assets/miranda.jpg'
import moon from '../assets/moon.jpg'
import neptune from '../assets/neptune.jpg'
import oberon from '../assets/oberon.jpg'
import pluto from '../assets/pluto.jpg'
import rhea from '../assets/rhea.jpg'
import saturn from '../assets/saturn.jpg'
import saturnRing from '../assets/saturn_ring.png'
import sun from '../assets/sun.jpg'
import tethys from '../assets/tethys.jpg'
import titania from '../assets/titania.jpg'
import triton from '../assets/triton.jpg'
import umbriel from '../assets/umbriel.jpg'
import uranus from '../assets/uranus.jpg'
import venus from '../assets/venus_atmosphere.jpg'
import stars from '../assets/stars.bin?url'

export const SURFACE: Partial<Record<BodyId, string>> = {
  sun,
  mercury,
  venus,
  earth: earthDay,
  moon,
  mars,
  jupiter,
  io,
  europa,
  ganymede,
  callisto,
  saturn,
  mimas,
  enceladus,
  tethys,
  dione,
  rhea,
  iapetus,
  uranus,
  miranda,
  ariel,
  umbriel,
  titania,
  oberon,
  neptune,
  triton,
  pluto,
  charon,
}

export const EARTH_NIGHT = earthNight
export const EARTH_CLOUDS = earthClouds
export const SATURN_RING = saturnRing
export const STARS = stars
