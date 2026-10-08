/*
 * WebGL2, directly. Every body is drawn per pixel by a ray meeting a sphere,
 * squashed at the poles where the body is, so a globe stays perfectly round
 * from a thousand km or a billion; a small moon's ray walks on in until it
 * meets its real, lumpy ground. Nothing is ever a mesh, and nothing is ever
 * placed in world space on the GPU: each body gets its own frame, centred on
 * the line from the eye to it and measured in its own radii, worked out on
 * the CPU in double precision. That is what lets true scale draw at all.
 *
 * The Sun is the only lamp. Night sides are dark, terminators are soft, the
 * Earth's cities come on as its ground turns away from the Sun, and planets
 * and moons cast real shadows on each other, so an eclipse, or a moon's
 * shadow crossing Jupiter, is drawn by the same light as everything else.
 */

import type { Eye } from './camera'
import { across, circleOf, cross, dot, frameOf, len, magnification, norm, scale, viewRotation } from './camera'
import type { BodyId } from '../sky/bodies'
import type { Vec3 } from '../sky/ephemeris'
import { DARK, LIGHTS } from '../sky/light'
import type { Glare } from '../sky/light'
import type { Stars } from '../sky/stars'

/** How a body is lit. */
export type Shade = 'rock' | 'moon' | 'earth' | 'gas' | 'sun'

const SHADE: Record<Shade, number> = { rock: 0, moon: 1, earth: 2, gas: 3, sun: 4 }

export interface BodyDraw {
  id: BodyId
  shade: Shade
  /** Centre from the eye, km. */
  rel: Vec3
  radius: number
  /** For a lumpy moon, where its shape is among theirs, and how far out its highest point is, km. */
  shape: { at: number; outer: number } | null
  flat: number
  /** Toward its prime meridian, 90 degrees east of that, and its north pole. */
  axes: [Vec3, Vec3, Vec3]
  /** The Sun's centre from this body's, km. */
  sun: Vec3
  /** The bodies that can shadow this one, from this one's centre, km. Four at most. */
  occ: Array<{ rel: Vec3; radius: number }>
  /** In the shadow, light bent through the air of what casts it: the Moon in the Earth's turns copper. */
  copper: boolean
  /** For a moon: toward its planet, how bright the planet's day side is on it, and its colour. */
  shine: { dir: Vec3; k: number; tint: readonly [number, number, number] } | null
  air: { depth: number; tint: readonly [number, number, number] } | null
  rings: { inner: number; outer: number } | null
  /** When it is too far to be more than a point: its colour times how strongly it shows, that strength, 0 to 1, and how wide, CSS px. */
  dot: { rgb: readonly [number, number, number]; a: number; size: number }
  /** How much of it shows, 0 to 1: a moon a pixel from its planet folds into the planet's point. */
  fade: number
}

export interface OrbitDraw {
  /** Points from the eye, in thousands of km, three floats each. */
  points: Float32Array
  alpha: Float32Array
  count: number
  ink: number
  /** Its colour, white if none. */
  color?: readonly [number, number, number]
  /** Drawn soft and wide, a glow along the path rather than a line. */
  glow?: boolean
}

export interface FrameDraw {
  eye: Eye
  /** Farthest first. */
  bodies: BodyDraw[]
  /** How much of the Sun's disc the eye can see, and what covers the rest. */
  sunSeen: number
  cover: { rel: Vec3; radius: number } | null
  orbits: OrbitDraw[]
  /** The lights in view, for the haze they put over the stars, and the magnitudes the lens adds to what the eye reaches. */
  glare: Glare[]
  lens: number
  /** Real seconds, for the Sun's surface to boil on. */
  clock: number
  /**
   * The Sun as it is at the time: its colour as a share of today's, how many
   * of its granules go round it, and how far it has settled, 0 to 1, into a
   * white dwarf's even glow.
   */
  sun: { tint: readonly [number, number, number]; cells: number; calm: number }
}

/*
 * One quad per body, over the part of the screen it can reach: on the
 * stereographic plane the sky round a body is always a circle (see
 * camera.ts), so that is a box round the circle. Each pixel turns its place
 * on the plane back into the direction of its ray, in the body's own frame.
 */
const BODY_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
uniform vec4 uBox;
uniform vec2 uScale;
out vec2 vPlane;
void main() {
  vPlane = uBox.xy + aCorner * uBox.zw;
  gl_Position = vec4(vPlane / uScale, 0.0, 1.0);
}`

// The Sun's own colours are drawn warm for the white of it now, and no tint
// of them reaches the white of a hotter star: by 7,000 K they are taken all
// the way to white before they are tinted.
const HOTTER = `
vec3 hotter(vec3 c, vec3 tint) {
  return mix(c, vec3(max(c.r, max(c.g, c.b))), clamp(4.0 * (1.0 - tint.r), 0.0, 1.0)) * tint;
}
`

const COMMON = `
const float PI = 3.14159265;
const float TAU = 6.28318531;

// How much of the Sun's disc a body leaves showing, seen from a point: the
// overlap of two discs. Partial gives the penumbra, none the umbra.
float sunlit(vec3 toSun, float sunR, vec3 toOcc, float occR) {
  float ds = length(toSun);
  float dO = length(toOcc);
  float rs = asin(min(1.0, sunR / ds));
  float ro = asin(min(1.0, occR / dO));
  vec3 a = toSun / ds;
  vec3 b = toOcc / dO;
  float sep = atan(length(cross(a, b)), dot(a, b));
  if (sep >= rs + ro) return 1.0;
  if (sep <= ro - rs) return 0.0;
  if (sep <= rs - ro) return 1.0 - (ro * ro) / (rs * rs);
  float r1 = rs;
  float r2 = ro;
  float d = sep;
  float a1 = r1 * r1 * acos(clamp((d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1), -1.0, 1.0));
  float a2 = r2 * r2 * acos(clamp((d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2), -1.0, 1.0));
  float a3 = 0.5 * sqrt(max(0.0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
  return clamp(1.0 - (a1 + a2 - a3) / (PI * r1 * r1), 0.0, 1.0);
}

vec3 encode(vec3 c) {
  // A shoulder rather than a hard clip, so a highlight rolls off instead of flattening.
  vec3 s = mix(c, 1.0 - 0.2 * exp(-(c - 0.8) / 0.2), step(0.8, c));
  return pow(max(s, 0.0), vec3(1.0 / 2.2));
}
${HOTTER}`

const BODY_FS = `#version 300 es
precision highp float;
in vec2 vPlane;
out vec4 o;
uniform mat3 uToLocal;
uniform float uD;
uniform vec3 uPole;
uniform vec3 uAxX;
uniform vec3 uAxY;
uniform float uK;
uniform vec3 uSun;
uniform float uSunR;
uniform vec3 uOcc[4];
uniform float uOccR[4];
uniform int uOccN;
uniform float uCopper;
uniform vec3 uShine;
uniform float uShineK;
uniform vec3 uShineTint;
uniform float uFade;
uniform int uShade;
uniform vec4 uAir;
uniform vec2 uRing;
uniform float uPx;
uniform vec3 uDot;
uniform float uDotA;
uniform float uDotMix;
uniform float uDotR;
uniform float uClock;
uniform vec3 uSunlight;
uniform vec3 uTint;
uniform float uCells;
uniform float uCalm;
uniform sampler2D uMap;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform sampler2D uRings;
uniform sampler2D uShapes;
uniform int uShape;
uniform vec2 uShapeRows;
${COMMON}
const vec3 DUSK = vec3(1.0, 0.42, 0.16);

// Into the space where the body is a unit sphere, and back.
vec3 stretch(vec3 x) { return x + (uK - 1.0) * dot(uPole, x) * uPole; }
vec3 squash(vec3 x) { return x + (1.0 / uK - 1.0) * dot(uPole, x) * uPole; }

// A lumpy moon, in the sphere round its highest point: toward x, how far out
// its ground is and which way the ground faces, in the moon's own frame.
vec4 lump(vec3 x) {
  vec3 n = normalize(x);
  float lon = atan(dot(n, uAxY), dot(n, uAxX));
  float lat = asin(clamp(dot(n, uPole), -1.0, 1.0));
  float row = clamp((0.5 - lat / PI) * uShapeRows.x, 0.5, uShapeRows.x - 0.5);
  return textureLod(uShapes, vec2(0.5 + lon / TAU, (float(uShape) * uShapeRows.x + row) / uShapeRows.y), 0.0);
}
// How far above its ground x is: below 0 inside it.
float above(vec3 x) {
  float r = length(x);
  return r < 0.3 ? -1.0 : r - lump(x).r;
}
vec3 facing(vec3 x) {
  vec3 f = lump(x).gba;
  return normalize(f.x * uAxX + f.y * uAxY + f.z * uPole);
}

// How much of the Sun its own hills leave on a point of its ground: looking
// toward the Sun for ground in the way, closely at first, and softly where
// the look only just clears it. The look starts a little off the ground and
// a little along, as the ground is only known to a few degrees.
float hills(vec3 x, vec3 n, vec3 L) {
  x += 0.01 * n;
  float b = dot(x, L);
  float d = b * b - dot(x, x) + 1.0;
  // Off the highest ground the look can start outside the sphere round it,
  // and heading away from it, nothing is in the way.
  float far = d > 0.0 ? -b + sqrt(d) : 0.0;
  if (far <= 0.03) return 1.0;
  float lit = 1.0;
  for (int i = 0; i < 16; i++) {
    float s = 0.03 + (far - 0.03) * float(i * i) / 225.0;
    lit = min(lit, clamp(8.0 * above(x + s * L) / s, 0.0, 1.0));
  }
  return lit;
}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// Distance to the nearest of a lattice of points, each wandering slowly about
// its cell: bright granules with dark lanes between, boiling.
float cells(vec3 x, float t) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d = 8.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3 - 1), float((k / 3) % 3 - 1), float(k / 9 - 1));
    vec3 h = vec3(hash(i + g), hash(i + g + 17.0), hash(i + g + 41.0));
    vec3 r = g + 0.5 + 0.38 * sin(t + TAU * h) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}

void main() {
  vec3 dl = normalize(uToLocal * vec3(2.0 * vPlane, dot(vPlane, vPlane) - 1.0));

  // The ray against the body, with the centre at (0, 0, uD). Worked through
  // cross products throughout, so nothing is the small difference of two
  // large numbers however far away the body is.
  vec3 ds = stretch(dl);
  float L = length(ds);
  vec3 dn = ds / L;
  vec3 m = (uD * uK / L) * squash(vec3(-dl.y, dl.x, 0.0));
  float p2 = dot(m, m);
  float p = sqrt(p2);
  vec3 q = cross(m, dn);
  float h = sqrt(max(0.0, 1.0 - p2));
  vec3 Ps = q - h * dn;
  vec3 P = squash(Ps);
  vec3 N = normalize(stretch(Ps));
  // Drawn over the whole screen, a ray can point away from the body and still
  // pass the right distance from its centre: that is a body behind the eye.
  float ahead = step(0.0, dl.z);
  float cov = clamp((1.0 - p) / max(fwidth(p), 1e-6) + 0.5, 0.0, 1.0) * ahead;

  // A lumpy moon: the ray is walked through the sphere round its highest
  // point until it is under the ground, then closed in on where it went in. A
  // ray that misses by less than a pixel still shows a little of the edge.
  if (uShape >= 0) {
    float px = uPx * uD;
    float least = 1.0;
    float tl = 0.0;
    bool hit = false;
    if (p < 1.0 + px) {
      float t0 = -h;
      float t1 = h;
      for (int i = 1; i <= 48; i++) {
        float t = mix(-h, h, float(i) / 48.0);
        float a = above(q + t * dn);
        if (a < 0.0) {
          t1 = t;
          hit = true;
          break;
        }
        t0 = t;
        if (a < least) {
          least = a;
          tl = t;
        }
      }
      if (hit) {
        for (int i = 0; i < 6; i++) {
          float t = 0.5 * (t0 + t1);
          if (above(q + t * dn) < 0.0) t1 = t;
          else t0 = t;
        }
        tl = t0;
      }
    }
    P = q + tl * dn;
    N = facing(P);
    cov = (hit ? 1.0 : 0.5 * clamp(1.0 - least / px, 0.0, 1.0)) * ahead;
  }

  vec3 nb = normalize(P);
  float lon = atan(dot(nb, uAxY), dot(nb, uAxX));
  float lat = asin(clamp(dot(nb, uPole), -1.0, 1.0));
  vec2 uv = vec2(0.5 + lon / TAU, 0.5 - lat / PI);
  // The Sun's map is smeared pale at the poles, which is just what sitting on
  // it looks over: stop short of them.
  if (uShade == 4) uv.y = 0.5 + (uv.y - 0.5) * 0.86;
  vec2 gx = dFdx(uv);
  vec2 gy = dFdy(uv);
  // Across the seam at the back the longitude jumps a whole turn: take the short way.
  gx.x -= floor(gx.x + 0.5);
  gy.x -= floor(gy.x + 0.5);
  vec3 albedo = textureGrad(uMap, uv, gx, gy).rgb;

  vec3 V = -dl;
  vec3 toSun = uSun - P;
  vec3 Ls = normalize(toSun);
  float cosI = dot(N, Ls);
  float cosE = max(dot(N, V), 0.0);
  float shade = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i < uOccN) shade *= sunlit(toSun, uSunR, uOcc[i] - P, uOccR[i]);
  }
  if (uShape >= 0 && cosI > 0.0) shade *= hills(P, N, Ls);

  // The rings' shadow on the globe.
  if (uRing.y > 0.0) {
    float sd = dot(uPole, Ls);
    float s = -dot(uPole, P) / (abs(sd) > 1e-4 ? sd : 1e-4);
    if (s > 0.0) {
      float ru = (length(P + s * Ls) - uRing.x) / (uRing.y - uRing.x);
      if (ru > 0.0 && ru < 1.0) shade *= 1.0 - 0.88 * textureLod(uRings, vec2(ru, 0.5), 2.0).a;
    }
  }

  vec3 lin = vec3(0.0);
  vec3 glow = vec3(0.0);
  bool sun = uShade == 4;
  vec3 disc = vec3(0.0);

  if (sun) {
    // The map's own fire, boiling slowly, with granules the size of a country
    // once you are near enough to see them. Hotter and yellower in the
    // middle, darker and redder toward the limb, where the eye only reaches
    // the cooler gas higher up.
    float mu = cosE;
    // A white dwarf has no fire left to boil: the map evens out to its mean.
    albedo = mix(albedo, textureLod(uMap, vec2(0.5), 12.0).rgb, uCalm);
    float n = noise(nb * 26.0 + vec3(uClock * 0.05)) * 0.6 + noise(nb * 70.0 - vec3(uClock * 0.09)) * 0.4;
    vec3 gp = nb * uCells;
    float close = 1.0 - smoothstep(0.25, 0.8, length(fwidth(gp)));
    float gran = close > 0.0 ? (0.5 - cells(gp, uClock * 0.25)) * close : 0.0;
    vec3 c = albedo * mix((0.82 + 0.36 * n) * (1.0 + 0.9 * gran), 1.0, uCalm);
    c *= (0.34 + 0.66 * sqrt(mu)) * vec3(1.0, 0.86 + 0.14 * mu, 0.7 + 0.3 * mu);
    // Toward yellow in the middle, by shifting the hue rather than adding
    // white, so it never goes pink.
    float heat = smoothstep(0.45, 1.0, mu);
    c.g += c.r * 0.18 * heat;
    c.b += c.r * 0.03 * heat;
    // In the Sun's colour at the time, as bright as it is now.
    vec3 t = hotter(c, uTint);
    disc = encode(t * (max(c.r, max(c.g, c.b)) / max(max(t.r, t.g), max(t.b, 1e-4))) * 1.3);
  } else if (uShade == 1) {
    // A moon: dust and frost, which throw light straight back, so a full
    // Moon is a flat disc rather than a ball.
    float mu0 = max(cosI, 0.0);
    lin = albedo * (2.0 * mu0 / (mu0 + cosE + 1e-4)) * shade * uSunlight * 1.1;
    // Inside the Earth's shadow, only light bent through the Earth's air
    // arrives, and every sunset on the Earth at once turns it copper.
    float umbra = pow(1.0 - shade, 3.0) * uCopper;
    lin += albedo * vec3(0.55, 0.16, 0.06) * 0.42 * umbra * smoothstep(-0.05, 0.2, cosI);
    // Its planet's light on the night side: earthshine, or Jupiter's.
    lin += albedo * uShineTint * uShineK * max(dot(N, uShine), 0.0);
  } else if (uShade == 2) {
    // The Earth: land and sea by day, cloud over both, cities by night.
    float cloud = textureGrad(uClouds, uv, gx, gy).r;
    vec3 lights = textureGrad(uNight, uv, gx, gy).rgb;
    float lit = max(cosI, 0.0);
    float sea = smoothstep(0.015, 0.06, albedo.b - albedo.r) * (1.0 - smoothstep(0.08, 0.2, dot(albedo, vec3(0.33))));
    vec3 H = normalize(Ls + V);
    float glint = pow(max(dot(N, H), 0.0), 90.0) * sea * (1.0 - cloud) * 0.9 * smoothstep(0.0, 0.1, cosI);
    vec3 ground = albedo * lit + vec3(1.0, 0.9, 0.75) * glint;
    ground = mix(ground, vec3(0.9) * lit, cloud * 0.9);
    lin = ground * shade * uSunlight;
    float dark = 1.0 - smoothstep(-0.14, 0.04, cosI);
    lin += lights * vec3(1.0, 0.76, 0.46) * 1.5 * dark * (1.0 - 0.75 * cloud);
  } else if (uShade == 3) {
    // Gas and cloud tops: darker toward the limb.
    float mu0 = max(cosI, 0.0);
    lin = albedo * mu0 * (0.68 + 0.32 * cosE) * shade * uSunlight;
  } else {
    lin = albedo * max(cosI, 0.0) * shade * uSunlight;
  }

  // Air. Looking down through it a little of the ground is lost and the
  // air's own light is added, more the more slanted the look, which is what
  // makes a limb glow. Off the limb the haze thins with height. Blue where the
  // Sun is up, red where it is setting, nothing at night.
  if (uAir.w > 0.0) {
    vec3 tint = uAir.rgb;
    float t = 1.0 - exp(-1.3 * uAir.w / max(cosE, 0.012));
    vec3 sky = mix(DUSK, tint, smoothstep(-0.04, 0.3, cosI)) * smoothstep(-0.16, 0.1, cosI) * shade;
    lin = mix(lin, sky * 0.85, t);
    float alt = max(p - 1.0, 0.0) / uAir.w;
    float haze = max(0.0, (exp(-5.0 * alt) - exp(-5.0)) / (1.0 - exp(-5.0)));
    vec3 up = q / max(length(q), 1e-6);
    float c = dot(up, normalize(uSun));
    glow = mix(DUSK, tint, smoothstep(-0.04, 0.3, c)) * smoothstep(-0.2, 0.12, c) * haze * 0.85 * ahead;
  }

  vec3 shown = sun ? disc : encode(lin);
  vec4 res = vec4(shown * cov, cov);

  // Rings: the plane of the equator, from the C ring to the edge of the A.
  if (uRing.y > 0.0) {
    float nd = dot(uPole, dl);
    nd = abs(nd) < 1e-6 ? 1e-6 : nd;
    float tR = uD * uPole.z / nd;
    vec3 X = vec3(tR * dl.x, tR * dl.y, -uD * (uPole.x * dl.x + uPole.y * dl.y) / nd);
    float ru = (length(X) - uRing.x) / (uRing.y - uRing.x);
    vec4 rs = textureGrad(uRings, vec2(ru, 0.5), vec2(dFdx(ru), 0.0), vec2(dFdy(ru), 0.0));
    float tHit = dot(P, dl) + uD * dl.z;
    bool inFront = p2 >= 1.0 || tR < tHit;
    if (tR > 0.0 && ru > 0.0 && ru < 1.0 && inFront) {
      vec3 Lr = normalize(uSun - X);
      // The globe's shadow falls across the rings behind it.
      float shadow = dot(X, Lr) < 0.0 ? smoothstep(0.96, 1.01, length(cross(X, Lr))) : 1.0;
      float sunUp = dot(uPole, uSun);
      bool litFace = sunUp * -uPole.z > 0.0;
      float elev = abs(dot(uPole, Lr));
      float lit = litFace ? 0.5 + 0.5 * sqrt(elev) : 0.06 + 0.4 * (1.0 - rs.a);
      vec3 rc = encode(rs.rgb * lit * shadow * uSunlight);
      float ra = rs.a * 0.95;
      res = vec4(rc * ra, ra) + res * (1.0 - ra);
    }
  }

  res.rgb += encode(glow) * (1.0 - res.a);

  // Too far to be more than a point: a point, drawn as a star as bright is.
  float ang = asin(clamp(length(dl.xy), 0.0, 1.0));
  float r = ang / uPx;
  float pt = exp(-(r * r) / (uDotR * uDotR));
  vec4 point = vec4(uDot * pt, uDotA * pt);
  o = mix(res, point, uDotMix) * uFade;
}`

/*
 * The light around the Sun: a soft halo, or a point when the disc is smaller
 * than a pixel, and the corona when something covers it.
 */
const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vPlane;
out vec4 o;
uniform mat3 uToLocal;
uniform float uAng;
uniform float uPx;
uniform float uHalo;
uniform float uSeen;
uniform float uCorona;
uniform vec3 uCover;
uniform float uCoverAng;
uniform vec3 uTint;
${HOTTER}
void main() {
  vec3 dl = normalize(uToLocal * vec3(2.0 * vPlane, dot(vPlane, vPlane) - 1.0));
  float th = atan(length(dl.xy), dl.z);
  float x = th / uAng;
  float px = uAng / uPx;
  float small = 1.0 - smoothstep(0.8, 3.0, px);
  float rc = max(uAng * 1.3, 2.4 * uPx);
  float core = exp(-(th * th) / (rc * rc)) * small;
  // From the very edge of the limb: a rim of fire hugging it, never more than
  // a few dozen pixels deep, inside a wide soft halo that goes close up,
  // where its glare would only wash over the sky. Against sunlit ground the
  // glare is as strong from Pluto as from the Earth, so however small the
  // disc the halo keeps its size in the eye.
  float off = max(small, smoothstep(1.0 - 1.0 / max(px, 1e-3), 1.0 + 1.5 / max(px, 1e-3), x));
  float rh = max(uAng * 2.2, uHalo);
  float near = 1.0 - smoothstep(0.3, 0.7, uAng);
  float halo = pow(rh / (th + rh), 2.3) * off * near;
  float rim = exp(-max(th - uAng, 0.0) / min(0.1 * uAng, 36.0 * uPx)) * off * (1.0 - small);
  vec3 c = (hotter(vec3(1.0, 0.9, 0.7), uTint) * core * 1.3 + hotter(vec3(1.0, 0.7, 0.36), uTint) * halo * 0.5 + hotter(vec3(1.0, 0.6, 0.2), uTint) * rim * 0.4) * uSeen;
  // A faint glow spread over hundreds of pixels steps visibly in eight bits: dither it.
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0 * step(0.002, c.r);
  float cover = atan(length(cross(dl, uCover)), dot(dl, uCover));
  float corona = smoothstep(1.0, 1.06, x) * exp(-(x - 1.0) * 1.9) * smoothstep(uCoverAng, uCoverAng * 1.03, cover);
  c += vec3(0.82, 0.88, 1.0) * corona * uCorona * 0.8;
  o = vec4(c, 0.0);
}`

/*
 * Stars and orbit lines are projected a point at a time: x and y over one
 * plus how far ahead the point is, the view looking down -z. A star right
 * behind the eye would land at infinity, so it is left out.
 *
 * Each star shows by how far it is over the faintest the eye makes out
 * against the sky behind it, which the lights in view lighten round
 * themselves: sky/light.ts, line for line.
 */
const STARS_VS = `#version 300 es
layout(location = 1) in vec3 aDir;
layout(location = 2) in vec4 aLook;
uniform mat3 uView;
uniform vec2 uScale;
uniform float uDpr;
uniform float uLens;
uniform float uDark;
uniform vec4 uGlare[${LIGHTS}];
uniform float uGlareMin[${LIGHTS}];
uniform int uGlareN;
out vec4 vLook;
void main() {
  float L = uDark;
  for (int i = 0; i < ${LIGHTS}; i++) {
    if (i < uGlareN) {
      vec3 g = uGlare[i].xyz;
      float th = max(uGlareMin[i], atan(length(cross(aDir, g)), dot(aDir, g)));
      L += uGlare[i].w / (th * th);
    }
  }
  float x = 7.93 - 5.0 * log(1.0 + 63.0 * sqrt(L)) * 0.4342945 + uLens + 0.172 - aLook.w;
  float b = max(x, 0.0) * 1.33;
  float a = min(1.0, 0.1 + 0.085 * b) * smoothstep(-0.25, 0.3, x);
  float size = b <= 11.0 ? 2.2 + 0.36 * b : 9.0 - 2.84 * exp(-0.36 * (b - 11.0) / 2.84);
  vec3 v = uView * aDir;
  gl_Position = v.z < 0.999 && a > 0.0 ? vec4(v.xy / uScale, 0.0, 1.0 - v.z) : vec4(0.0, 0.0, 2.0, 1.0);
  gl_PointSize = size * uDpr;
  vLook = vec4(aLook.rgb * a, 1.0);
}`

const STARS_FS = `#version 300 es
precision mediump float;
in vec4 vLook;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(c, c) * 3.2);
  o = vec4(vLook.rgb * a, 0.0);
}`

const ORBIT_VS = `#version 300 es
layout(location = 3) in vec3 aPos;
layout(location = 4) in float aAlpha;
uniform mat3 uView;
uniform vec2 uScale;
uniform vec2 uOffset;
out float vAlpha;
void main() {
  vec3 v = uView * aPos;
  float w = length(v) - v.z;
  gl_Position = vec4(v.xy / uScale + uOffset * w, 0.0, w);
  vAlpha = aAlpha;
}`

const ORBIT_FS = `#version 300 es
precision mediump float;
in float vAlpha;
uniform float uInk;
uniform vec3 uColor;
out vec4 o;
void main() {
  float a = vAlpha * uInk;
  o = vec4(uColor * a, a);
}`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type) as WebGLShader
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const p = gl.createProgram() as WebGLProgram
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}

type Uniforms = Record<string, WebGLUniformLocation | null>

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram): Uniforms {
  const out: Uniforms = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)
    if (info) out[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name)
  }
  return out
}

/** A point's sprite falls to exp(-3.2) at its edge: as a blur, its size over this. */
const SPRITE = Math.sqrt(12.8)
/** The least the Sun's halo reaches, radians as the eye sees the widest lens. */
const HALO = (0.3 * Math.PI) / 180
/** Thousands of km: the unit orbit lines are handed over in. */
export const ORBIT_UNIT = 1000
/** Where a line is drawn, CSS px off, and how strongly. */
const LINE_PASS: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 1]]
const GLOW_PASSES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0.6],
  ...[1.5, 3].flatMap((r, i) =>
    Array.from({ length: 8 }, (_, k) => [r * Math.cos((k * Math.PI) / 4), r * Math.sin((k * Math.PI) / 4), i ? 0.15 : 0.35] as const),
  ),
]
/** Today's sunlight, a little warm of white. */
const SUNLIGHT = [1, 0.97, 0.92] as const

export class Renderer {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private body: WebGLProgram
  private glow: WebGLProgram
  private starsProg: WebGLProgram
  private orbitProg: WebGLProgram
  private bu: Uniforms
  private gu: Uniforms
  private su: Uniforms
  private ou: Uniforms
  private quadVao: WebGLVertexArrayObject
  private starsVao: WebGLVertexArrayObject
  private starCount = 0
  private orbitVao: WebGLVertexArrayObject
  private orbitPos: WebGLBuffer
  private orbitAlpha: WebGLBuffer
  private maps = new Map<string, WebGLTexture>()
  private dpr = 1
  private aniso = 0
  private shapeRows = 1
  private shapeCount = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: false, premultipliedAlpha: true, antialias: true })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl
    this.body = compile(gl, BODY_VS, BODY_FS)
    this.glow = compile(gl, BODY_VS, GLOW_FS)
    this.starsProg = compile(gl, STARS_VS, STARS_FS)
    this.orbitProg = compile(gl, ORBIT_VS, ORBIT_FS)
    this.bu = uniforms(gl, this.body)
    this.gu = uniforms(gl, this.glow)
    this.su = uniforms(gl, this.starsProg)
    this.ou = uniforms(gl, this.orbitProg)
    const ext = gl.getExtension('EXT_texture_filter_anisotropic')
    if (ext) this.aniso = Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)

    this.quadVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.quadVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.starsVao = gl.createVertexArray() as WebGLVertexArrayObject

    this.orbitVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.orbitVao)
    this.orbitPos = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitPos)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0)
    this.orbitAlpha = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitAlpha)
    gl.enableVertexAttribArray(4)
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // Until a map arrives, a body is its own colour.
    this.solid('blank', [128, 128, 128, 255])
    this.solid('dark', [0, 0, 0, 0])
  }

  private solid(key: string, rgba: [number, number, number, number]): void {
    const gl = this.gl
    const t = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba))
    const old = this.maps.get(key)
    if (old) gl.deleteTexture(old)
    this.maps.set(key, t)
  }

  /** A body in its own colour, until its map arrives. */
  paint(key: string, hex: string): void {
    const n = parseInt(hex.replace('#', ''), 16)
    this.solid(key, [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255])
  }

  /** A map by url. `linear` keeps its values as they are, for masks. */
  load(key: string, url: string, linear = false): Promise<void> {
    const img = new Image()
    img.src = url
    return img.decode().then(() => {
      const gl = this.gl
      const t = gl.createTexture() as WebGLTexture
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
      gl.texImage2D(gl.TEXTURE_2D, 0, linear ? gl.RGBA8 : gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, key === 'rings' ? gl.CLAMP_TO_EDGE : gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      if (this.aniso > 1) gl.texParameterf(gl.TEXTURE_2D, 0x84fe, this.aniso)
      const old = this.maps.get(key)
      if (old) gl.deleteTexture(old)
      this.maps.set(key, t)
    })
  }

  setStars(stars: Stars): void {
    const gl = this.gl
    const look = new Float32Array(stars.count * 4)
    for (let i = 0; i < stars.count; i++) look.set([...starColour(stars.bv[i]), stars.mag[i]], i * 4)
    gl.bindVertexArray(this.starsVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, stars.dir, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, look, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    this.starCount = stars.count
  }

  /** The lumpy moons' shapes, each a grid of how far out its ground is and which way it faces, one under the next. */
  setShapes(data: Float32Array, columns: number, rows: number): void {
    const gl = this.gl
    const t = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, columns, data.length / 4 / columns, 0, gl.RGBA, gl.FLOAT, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const old = this.maps.get('shapes')
    if (old) gl.deleteTexture(old)
    this.maps.set('shapes', t)
    this.shapeRows = rows
    this.shapeCount = data.length / 4 / columns / rows
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
  }

  draw(frame: FrameDraw): void {
    const gl = this.gl
    const w = this.canvas.width
    const h = this.canvas.height
    gl.viewport(0, 0, w, h)
    gl.clearColor(0.004, 0.005, 0.009, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const { eye } = frame
    const fr = frameOf(eye, w / h)
    const rot = viewRotation(eye)
    const view = new Float32Array([rot[0], rot[1], rot[2], rot[4], rot[5], rot[6], rot[8], rot[9], rot[10]])
    // A device pixel on the plane, and the sky it covers in a direction.
    const unit = (2 * fr.sy) / h
    const pxAt = (d: Vec3): number => unit * (1 + dot(d, fr.forward))
    const power = magnification(eye.fov)

    if (this.starCount) {
      gl.useProgram(this.starsProg)
      gl.uniformMatrix3fv(this.su.uView, false, view)
      gl.uniform2f(this.su.uScale, fr.sx, fr.sy)
      gl.uniform1f(this.su.uDpr, this.dpr)
      gl.uniform1f(this.su.uLens, frame.lens)
      gl.uniform1f(this.su.uDark, DARK)
      const glare = frame.glare.slice(0, LIGHTS)
      gl.uniform1i(this.su.uGlareN, glare.length)
      if (glare.length) {
        gl.uniform4fv(this.su.uGlare, glare.flatMap((g) => [g.dir[0], g.dir[1], g.dir[2], g.k]))
        gl.uniform1fv(this.su.uGlareMin, glare.map((g) => g.min))
      }
      gl.bindVertexArray(this.starsVao)
      gl.drawArrays(gl.POINTS, 0, this.starCount)
    }

    if (frame.orbits.length) {
      gl.useProgram(this.orbitProg)
      gl.uniformMatrix3fv(this.ou.uView, false, view)
      gl.uniform2f(this.ou.uScale, fr.sx, fr.sy)
      gl.bindVertexArray(this.orbitVao)
      let total = 0
      for (const o of frame.orbits) total += o.count
      const pos = new Float32Array(total * 3)
      const alpha = new Float32Array(total)
      let at = 0
      for (const o of frame.orbits) {
        pos.set(o.points.subarray(0, o.count * 3), at * 3)
        alpha.set(o.alpha.subarray(0, o.count), at)
        at += o.count
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitPos)
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STREAM_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.orbitAlpha)
      gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.STREAM_DRAW)
      at = 0
      for (const o of frame.orbits) {
        const c = o.color ?? [1, 1, 1]
        gl.uniform3f(this.ou.uColor, c[0], c[1], c[2])
        // A glow is the line drawn again round itself, a pixel and a half off and three, fainter.
        for (const [dx, dy, k] of o.glow ? GLOW_PASSES : LINE_PASS) {
          gl.uniform2f(this.ou.uOffset, (dx * 2 * this.dpr) / w, (dy * 2 * this.dpr) / h)
          gl.uniform1f(this.ou.uInk, o.ink * k)
          gl.drawArrays(gl.LINE_STRIP, at, o.count)
        }
        at += o.count
      }
    }

    const localOf = (rel: Vec3): { D: number; toLocal: Float32Array; u: Vec3; v: Vec3; w: Vec3 } => {
      const D = len(rel)
      const wv = scale(rel, 1 / D)
      const v = across(eye.up, wv, eye.forward)
      const u = cross(v, wv)
      // View to local: a row for each local axis, in the view's terms.
      const toLocal = new Float32Array(9)
      const put = (row: number, a: Vec3): void => {
        for (let i = 0; i < 3; i++) toLocal[i * 3 + row] = rot[i] * a[0] + rot[4 + i] * a[1] + rot[8 + i] * a[2]
      }
      put(0, u)
      put(1, v)
      put(2, wv)
      return { D, toLocal, u, v, w: wv }
    }
    const inLocal = (a: Vec3, f: { u: Vec3; v: Vec3; w: Vec3 }, s = 1): [number, number, number] => [
      dot(a, f.u) * s,
      dot(a, f.v) * s,
      dot(a, f.w) * s,
    ]
    // The quad over the screen where the sky within `bound` of a body's
    // centre lands, with a few pixels to spare. False when none of it is on screen.
    const place = (u: Uniforms, f: { toLocal: Float32Array; w: Vec3 }, bound: number): boolean => {
      const c = circleOf(fr, f.w, bound)
      const m = c ? c.r + 8 * unit : 0
      const x0 = c ? Math.max(-fr.sx, c.x - m) : -fr.sx
      const x1 = c ? Math.min(fr.sx, c.x + m) : fr.sx
      const y0 = c ? Math.max(-fr.sy, c.y - m) : -fr.sy
      const y1 = c ? Math.min(fr.sy, c.y + m) : fr.sy
      if (x0 >= x1 || y0 >= y1) return false
      gl.uniformMatrix3fv(u.uToLocal, false, f.toLocal)
      gl.uniform2f(u.uScale, fr.sx, fr.sy)
      gl.uniform4f(u.uBox, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2)
      return true
    }

    const sunBody = frame.bodies.find((b) => b.id === 'sun')
    const drawGlow = (b: BodyDraw, seen: number, corona: number): void => {
      const f = localOf(b.rel)
      if (f.D <= b.radius) return
      const ang = Math.asin(b.radius / f.D)
      const px = pxAt(f.w)
      const halo = HALO / power
      const reachAng = Math.min(Math.PI / 2, 16 * Math.max(ang * 2.2, halo))
      gl.useProgram(this.glow)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      if (!place(this.gu, f, reachAng)) return
      gl.uniform1f(this.gu.uAng, ang)
      gl.uniform1f(this.gu.uPx, px)
      gl.uniform1f(this.gu.uHalo, halo)
      gl.uniform1f(this.gu.uSeen, seen)
      gl.uniform1f(this.gu.uCorona, corona)
      gl.uniform3f(this.gu.uTint, frame.sun.tint[0], frame.sun.tint[1], frame.sun.tint[2])
      const c = frame.cover
      if (c) {
        gl.uniform3fv(this.gu.uCover, inLocal(norm(c.rel), f))
        gl.uniform1f(this.gu.uCoverAng, Math.asin(Math.min(1, c.radius / len(c.rel))))
      } else {
        gl.uniform3f(this.gu.uCover, 0, 0, -1)
        gl.uniform1f(this.gu.uCoverAng, 0)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    const drawBody = (b: BodyDraw): void => {
      const f = localOf(b.rel)
      // A lumpy moon is drawn in the sphere round its highest point, and as a
      // ball of its mean size until its shape arrives.
      const shape = this.maps.has('shapes') ? b.shape : null
      const R = shape ? shape.outer : b.radius
      if (f.D <= R * 1.001) return
      const u = this.bu
      gl.useProgram(this.body)
      const reach = Math.max(1 + (b.air ? b.air.depth * 1.2 : 0), b.rings ? b.rings.outer / R : 1) * R
      const px = pxAt(f.w)
      const rpx = Math.asin(R / f.D) / px
      // Small bodies are drawn as points, which need room around them. A
      // bright one's point is wider than its disc first is, so it gives way
      // only once the disc has grown into it.
      const blur = (b.dot.size * this.dpr) / SPRITE
      const full = Math.max(2.2, 1.5 * blur)
      const dotMix = 1 - smoothstep(0.32 * full, full, rpx)
      const room = Math.max(f.D > reach * 1.0001 ? Math.asin(reach / f.D) : Math.PI, 0.6 * b.dot.size * this.dpr * px)
      if (!place(u, f, room)) return
      gl.uniform1f(u.uD, f.D / R)
      gl.uniform3fv(u.uPole, inLocal(b.axes[2], f))
      gl.uniform3fv(u.uAxX, inLocal(b.axes[0], f))
      gl.uniform3fv(u.uAxY, inLocal(b.axes[1], f))
      gl.uniform1f(u.uK, 1 / (1 - b.flat))
      gl.uniform3fv(u.uSun, inLocal(b.sun, f, 1 / R))
      gl.uniform1f(u.uSunR, (sunBody?.radius ?? 695_700) / R)
      const occ = b.occ.slice(0, 4)
      gl.uniform1i(u.uOccN, occ.length)
      if (occ.length) {
        gl.uniform3fv(u.uOcc, occ.flatMap((o) => inLocal(o.rel, f, 1 / R)))
        gl.uniform1fv(u.uOccR, occ.map((o) => o.radius / R))
      }
      gl.uniform1f(u.uCopper, b.copper ? 1 : 0)
      if (b.shine) {
        gl.uniform3fv(u.uShine, inLocal(b.shine.dir, f))
        gl.uniform1f(u.uShineK, b.shine.k)
        gl.uniform3f(u.uShineTint, b.shine.tint[0], b.shine.tint[1], b.shine.tint[2])
      } else gl.uniform1f(u.uShineK, 0)
      gl.uniform1i(u.uShade, SHADE[b.shade])
      if (b.air) gl.uniform4f(u.uAir, b.air.tint[0], b.air.tint[1], b.air.tint[2], b.air.depth)
      else gl.uniform4f(u.uAir, 0, 0, 0, 0)
      if (b.rings) gl.uniform2f(u.uRing, b.rings.inner / R, b.rings.outer / R)
      else gl.uniform2f(u.uRing, 0, 0)
      gl.uniform1f(u.uPx, px)
      gl.uniform3f(u.uDot, b.dot.rgb[0], b.dot.rgb[1], b.dot.rgb[2])
      gl.uniform1f(u.uDotA, b.dot.a)
      gl.uniform1f(u.uDotMix, dotMix)
      gl.uniform1f(u.uDotR, blur)
      gl.uniform1f(u.uClock, frame.clock)
      gl.uniform1f(u.uFade, b.fade)
      gl.uniform1i(u.uShape, shape ? shape.at : -1)
      this.bind(0, b.id)
      this.bind(1, b.id === 'earth' ? 'night' : 'dark')
      this.bind(2, b.id === 'earth' ? 'clouds' : 'dark')
      this.bind(3, b.rings ? 'rings' : 'dark')
      this.bind(4, 'shapes')
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    gl.useProgram(this.body)
    // Lit by the Sun at the time: the eye takes to its colour, but not all the way.
    const { tint, cells, calm } = frame.sun
    const light = SUNLIGHT.map((c, i) => c * Math.sqrt(tint[i]))
    const top = Math.max(...light) / SUNLIGHT[0]
    gl.uniform3f(this.bu.uSunlight, light[0] / top, light[1] / top, light[2] / top)
    gl.uniform3f(this.bu.uTint, tint[0], tint[1], tint[2])
    gl.uniform1f(this.bu.uCells, cells)
    gl.uniform1f(this.bu.uCalm, calm)
    gl.uniform1i(this.bu.uMap, 0)
    gl.uniform1i(this.bu.uNight, 1)
    gl.uniform1i(this.bu.uClouds, 2)
    gl.uniform1i(this.bu.uRings, 3)
    gl.uniform1i(this.bu.uShapes, 4)
    gl.uniform2f(this.bu.uShapeRows, this.shapeRows, this.shapeRows * this.shapeCount)
    gl.bindVertexArray(this.quadVao)

    for (const b of frame.bodies) {
      drawBody(b)
      // The Sun's light spills round whatever is behind it, and is covered by
      // whatever is in front.
      if (b === sunBody) drawGlow(b, frame.sunSeen, 0)
    }

    // The corona, over the body that covers the Sun.
    if (sunBody && frame.cover && frame.sunSeen < 0.08) drawGlow(sunBody, 0, 1 - frame.sunSeen / 0.08)
    gl.bindVertexArray(null)
  }

  private bind(unit: number, key: string): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, this.maps.get(key) ?? (this.maps.get('blank') as WebGLTexture))
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A star's colour from its B-V index, kept pale: stars look nearly white to the eye. */
function starColour(bv: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [-0.3, [0.66, 0.76, 1]],
    [0, [0.84, 0.89, 1]],
    [0.6, [1, 0.96, 0.88]],
    [1.2, [1, 0.84, 0.64]],
    [2, [1, 0.7, 0.45]],
  ]
  if (bv <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [b1, c1] = stops[i]
    const [b0, c0] = stops[i - 1]
    if (bv <= b1) {
      const t = (bv - b0) / (b1 - b0)
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]
    }
  }
  return stops[stops.length - 1][1]
}
