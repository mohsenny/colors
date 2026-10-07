/*
 * WebGL2, directly. What is on screen is a net of ribbons, a set of points and
 * a sphere or two drawn per pixel, which a 3D library would only add weight to.
 *
 * The canvas is transparent and sits on the lit CSS surface, so the room is
 * drawn on the same lightbox the sheets in Lightbox lie on. Everything is
 * premultiplied: graphite at low alpha over near-white is the whole look, and
 * straight alpha fringes it.
 */

import type { Mat4 } from './camera'
import { VIEW_AT, levelView } from '../physics/lattice'
import type { Level, Net } from '../physics/lattice'
import type { Vec3 } from '../physics/motion'
import type { Surface } from './maps'

/*
 * Each rope is drawn a segment at a time, as a ribbon turned to face the
 * screen, so its weight can follow the pull: a hairline where space is at
 * rest, heavier where the mass has drawn it in. The bend is the boldest part
 * of every rope, and the straight run far out recedes.
 */
const LATTICE_VS = `#version 300 es
in vec2 aCorner;
in vec3 aA;
in vec3 aB;
in float aSqueezeA;
in float aSqueezeB;
in float aAxis;
in float aLink;
uniform mat4 uVP;
uniform vec2 uView;
uniform float uDpr;
uniform vec3 uEye;
uniform vec2 uFog;
uniform vec2 uReach;
uniform vec2 uNear;
uniform float uAlpha;
uniform float uBody;
uniform vec4 uInk[3];
uniform vec2 uWeight;
out float vAlpha;
out vec3 vInk;
out float vAcross;
out float vHalf;
const vec4 GONE = vec4(2.0, 2.0, 2.0, 1.0);
void main() {
  vAlpha = 0.0;
  vInk = vec3(0.0);
  vAcross = 0.0;
  vHalf = 1.0;
  // The last vertex of a rope does not run on into the next rope.
  if (aLink < 0.5) {
    gl_Position = GONE;
    return;
  }
  vec4 a = uVP * vec4(aA, 1.0);
  vec4 b = uVP * vec4(aB, 1.0);
  // Cut the segment where it passes behind the eye, or its direction on
  // screen turns inside out.
  const float E = 1e-3;
  if (a.w < E && b.w < E) {
    gl_Position = GONE;
    return;
  }
  float ta = a.w < E ? (E - a.w) / (b.w - a.w) : 0.0;
  float tb = b.w < E ? (E - a.w) / (b.w - a.w) : 1.0;
  vec4 ca = mix(a, b, ta);
  vec4 cb = mix(a, b, tb);
  float t = mix(ta, tb, aCorner.x);
  vec3 pos = mix(aA, aB, t);
  float squeeze = mix(aSqueezeA, aSqueezeB, t);

  // Weight in device pixels: one at rest, up to uWeight.x CSS px more at a
  // pull of uWeight.y. Under a pixel the ribbon stays a pixel and gives up ink
  // instead, which is how a hairline thinner than the screen looks.
  float pull = smoothstep(0.0, uWeight.y, squeeze);
  float w = 1.0 + uWeight.x * uDpr * pull;
  float cover = min(w, 1.0);
  w = max(w, 1.0);
  vHalf = 0.5 * w;
  // Half a pixel more each side, for the soft edge.
  float hw = vHalf + 0.5;
  vAcross = aCorner.y * hw;
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * uView;
  vec2 dir = dot(d, d) > 1e-8 ? normalize(d) : vec2(1.0, 0.0);
  vec4 c = mix(ca, cb, aCorner.x);
  c.xy += vec2(-dir.y, dir.x) * aCorner.y * hw * 2.0 / uView * c.w;
  gl_Position = c;

  vec4 ink = uInk[int(aAxis + 0.5)];
  vInk = ink.rgb;
  float dist = distance(pos, uEye);
  // Aerial perspective: far ropes sink into the surface, as far things do in a
  // lit room. Never to zero, or the back of the net stops being a net.
  float fog = 1.0 - 0.85 * smoothstep(uFog.x, uFog.y, dist);
  // The net dissolves into the surface away from the body instead of ending,
  // so there is never an edge. Measured at rest, which the squeeze gives back,
  // so how far a level shows does not depend on how hard it is pulled.
  float rest = length(pos) / max(1e-3, 1.0 - squeeze);
  float reach = 1.0 - smoothstep(uReach.x, uReach.y, rest);
  // A rope passing right by the lens would be a smear across the screen.
  float near = smoothstep(uNear.x, uNear.y, dist);
  // Ropes between the eye and the body thin to a ghost across its face, so
  // the body stays an object the net bends round rather than a thing in a cage.
  float D = length(uEye);
  vec3 toward = -uEye / D;
  vec3 v = pos - uEye;
  float along = dot(v, toward);
  float off = length(v - toward * along) * D / max(along, 1e-3);
  float front = 1.0 - smoothstep(D - uBody, D, along);
  float face = 1.0 - 0.8 * front * (1.0 - smoothstep(uBody, 1.3 * uBody, off));
  vAlpha = uAlpha * ink.a * cover * fog * reach * near * face * (1.0 + 1.5 * squeeze);
}`

const LATTICE_FS = `#version 300 es
precision highp float;
in float vAlpha;
in vec3 vInk;
in float vAcross;
in float vHalf;
out vec4 o;
void main() {
  float edge = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  float a = min(vAlpha, 0.72) * edge;
  if (a <= 0.0) discard;
  o = vec4(vInk * a, a);
}`

const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** Strikes ringing at once, the newest kept. */
const MAX_IMPACTS = 8

const SPHERE_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform mat4 uInv;
uniform mat4 uVP;
uniform vec3 uEye;
uniform vec3 uLight;
uniform vec3 uCenter;
uniform float uR;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uHole;
uniform float uGlow;
uniform float uAlpha;
uniform float uDpr;
// A photographed surface: 0 none, 1 under the lamps, 2 lit from within as
// Solar draws the Sun. uFace is the longitude that faces +z.
uniform int uSurface;
uniform sampler2D uMap;
uniform sampler2D uClouds;
uniform float uCloud;
uniform float uFace;
// Strikes: where, as a unit vector from the centre, and how far through
// (0 to 1), then the colour of what struck.
uniform vec4 uHit[${MAX_IMPACTS}];
uniform vec3 uHitInk[${MAX_IMPACTS}];
uniform int uHits;
out vec4 o;
const float PI = 3.14159265;
const float TAU = 6.28318531;
// The maps are filtered in linear light. This gives back the display values
// the flat colours are in.
vec3 display(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// Solar's: a shoulder rather than a hard clip, so a highlight rolls off
// instead of flattening.
vec3 encode(vec3 c) {
  vec3 s = mix(c, 1.0 - 0.2 * exp(-(c - 0.8) / 0.2), step(0.8, c));
  return pow(max(s, 0.0), vec3(1.0 / 2.2));
}
void main() {
  vec4 far = uInv * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uEye);
  vec3 rel = uEye - uCenter;
  float b = dot(rel, dir);
  float c = dot(rel, rel) - uR * uR;
  float disc = b * b - c;
  float w = fwidth(disc);
  // Only what is well clear of the edge yet, so every pixel drawn still has
  // its neighbours for the map's gradients.
  if (disc < -3.0 * w || -b < 0.0) discard;
  float t = -b - sqrt(max(disc, 0.0));
  vec3 hit = uEye + dir * t;
  vec3 n = normalize(hit - uCenter);
  vec3 albedo = vec3(0.0);
  float cloud = 0.0;
  if (uSurface > 0) {
    // North up the uprights, east to the right seen from outside.
    float lon = uFace + atan(n.x, n.z);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2(0.5 + lon / TAU, 0.5 - lat / PI);
    // The Sun's map is smeared pale at the poles: stop short of them.
    if (uSurface == 2) uv.y = 0.5 + (uv.y - 0.5) * 0.86;
    vec2 gx = dFdx(uv);
    vec2 gy = dFdy(uv);
    // Across the seam at the back the longitude jumps a whole turn: take the short way.
    gx.x -= floor(gx.x + 0.5);
    gy.x -= floor(gy.x + 0.5);
    albedo = textureGrad(uMap, uv, gx, gy).rgb;
    if (uCloud > 0.5) cloud = textureGrad(uClouds, uv, gx, gy).r;
  }
  if (disc < -w) discard;
  float edge = clamp(disc / w + 1.0, 0.0, 1.0);
  float facing = max(dot(n, -dir), 0.0);
  float rim = pow(1.0 - facing, 3.0);
  vec3 col;
  if (uHole > 0.5) {
    // Ink, with a faint cool rim so it stays a sphere and not a hole in the screen.
    col = mix(vec3(0.063, 0.063, 0.078), vec3(0.40, 0.44, 0.56), rim * 0.6);
  } else if (uGlow > 0.5) {
    // Light has no surface for the lamps to shade: hot in the middle, gold at the rim.
    col = mix(uColor, uHot, facing * facing);
  } else if (uSurface == 2) {
    // The Sun as Solar draws it: hotter and yellower in the middle, darker
    // and redder toward the limb, where the eye only reaches the cooler gas
    // higher up. Yellower by shifting the hue rather than adding white, so it
    // never goes pink.
    vec3 s = albedo * (0.34 + 0.66 * sqrt(facing)) * vec3(1.0, 0.86 + 0.14 * facing, 0.7 + 0.3 * facing);
    float heat = smoothstep(0.45, 1.0, facing);
    s.g += s.r * 0.18 * heat;
    s.b += s.r * 0.03 * heat;
    col = encode(s * 1.3);
  } else {
    // The lamps are upper left, as they are in Lightbox; the shadow side goes
    // cool, as the shadows there do. A photographed body takes them on its
    // map, the Earth's cloud laid over as Solar lays it.
    vec3 base = uSurface == 1 ? display(mix(albedo, vec3(0.9), cloud * 0.9)) : uColor;
    float l = clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
    l = l * l;
    col = base * (0.58 + 0.5 * l);
    col = mix(col * vec3(0.80, 0.84, 0.95), col, l);
    col = mix(col, vec3(1.0), rim * 0.16);
  }
  // Where something struck, a flash, then three rings a beat apart that
  // spread over the surface, thinning and fading as they go. A pixel or two
  // wide however near the eye is, with a white-hot core so they show on a
  // body the colour of what hit it.
  for (int i = 0; i < ${MAX_IMPACTS}; i++) {
    if (i >= uHits) break;
    float u = uHit[i].w;
    float ang = acos(clamp(dot(n, uHit[i].xyz), -1.0, 1.0));
    float px = max(fwidth(ang), 1e-5);
    float ink = 0.0;
    float core = 0.0;
    for (int k = 0; k < 3; k++) {
      float s = (u - 0.14 * float(k)) / 0.72;
      if (s <= 0.0 || s >= 1.0) continue;
      float reach = 1.15 * (1.0 - pow(1.0 - s, 2.2));
      float d = abs(ang - reach) / px;
      float hw = uDpr * mix(1.6, 0.6, s);
      float fade = pow(1.0 - s, 1.3);
      ink = max(ink, fade * (1.0 - smoothstep(hw, hw + 1.0, d)));
      core = max(core, fade * (1.0 - smoothstep(0.0, hw, d)));
    }
    float flash = (1.0 - smoothstep(0.0, 0.14, u)) * (1.0 - smoothstep(0.0, 0.08 + 0.5 * u, ang));
    vec3 ring = mix(uHitInk[i], vec3(1.0), 0.6 * max(core, flash));
    col = mix(col, ring, max(ink, flash));
  }
  vec4 clip = uVP * vec4(hit, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  o = vec4(col * edge * uAlpha, edge * uAlpha);
}`

const POINTS_VS = `#version 300 es
in vec3 aPos;
in vec4 aColor;
in vec2 aShape;
uniform mat4 uVP;
uniform float uDpr;
out vec4 vColor;
out float vRing;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = aShape.x * uDpr;
  vColor = aColor;
  // Shape: 0 dot, 1 ring, and 2 and 3 the same drawn on top.
  vRing = mod(aShape.y, 2.0);
  // On top: the aim's marks sit on the limb, or over the body.
  if (aShape.y > 1.5) gl_Position.z = -0.999 * gl_Position.w;
}`

const POINTS_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vRing;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float aa = max(fwidth(r), 0.02);
  float a = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (vRing > 0.5) a *= smoothstep(0.52 - aa, 0.52, r);
  a *= vColor.a;
  if (a <= 0.0) discard;
  o = vec4(vColor.rgb * a, a);
}`

/*
 * Light as a streak: a ribbon a few pixels wide, turned to face the screen,
 * soft across its width with a hot core near the front. Each sample carries
 * its neighbours so the ribbon bends at the sample and segments never overlap.
 */
const BEAM_VS = `#version 300 es
in vec3 aPos;
in vec3 aPrev;
in vec3 aNext;
in vec4 aShape;
uniform mat4 uVP;
uniform vec2 uView;
uniform float uDpr;
out float vAcross;
out float vAlpha;
out float vHot;
vec2 screen(vec3 p) {
  vec4 c = uVP * vec4(p, 1.0);
  return c.xy / max(c.w, 1e-4) * uView * 0.5;
}
void main() {
  vec4 c = uVP * vec4(aPos, 1.0);
  vec2 d = screen(aNext) - screen(aPrev);
  vec2 t = dot(d, d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  c.xy += vec2(-t.y, t.x) * aShape.x * aShape.y * uDpr / uView * c.w;
  gl_Position = c;
  vAcross = aShape.x;
  vAlpha = aShape.z;
  vHot = aShape.w;
}`

const BEAM_FS = `#version 300 es
precision highp float;
in float vAcross;
in float vAlpha;
in float vHot;
uniform vec3 uColor;
uniform vec3 uHot;
out vec4 o;
void main() {
  float x = abs(vAcross);
  float a = vAlpha * (1.0 - smoothstep(0.05, 1.0, x));
  vec3 col = mix(uColor, uHot, vHot * (1.0 - x));
  o = vec4(col * a, a);
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

export interface BodyDraw {
  radius: number
  color: Vec3
  hole: boolean
  /** Its photographed surface, if it has one. Until the map is in, the colour. */
  surface: Surface | null
}

/** A ring spreading from where something struck the body. */
export interface ImpactDraw {
  /** Unit vector from the body's centre. */
  at: Vec3
  color: Vec3
  /** 0 as it strikes, 1 when the last ring is gone. */
  age: number
}

/** What is being ridden, drawn as a ball, since the eye sits right on it. */
export interface SeatDraw {
  center: Vec3
  radius: number
  color: Vec3
  /** Light: lit from inside, in the beam's colours. */
  glow: boolean
  alpha: number
}

export interface FrameDraw {
  viewProj: Mat4
  inverse: Mat4
  eye: Vec3
  light: Vec3
  /** The orbit distance the net is drawn for, and where ropes start to fade at the lens. */
  detail: number
  lens: number
  body: BodyDraw
  impacts: ImpactDraw[]
  seat: SeatDraw | null
  /** x y z, r g b a, size px, ring flag. */
  points: Float32Array
  pointCount: number
  /** x y z, previous, next, then side, width px, alpha, heat: gl.TRIANGLES. */
  beams: Float32Array
  beamCount: number
  /** Light's colour, and the hotter one at the front of its core. */
  beamColor: Vec3
  beamHot: Vec3
}

/**
 * One grey per direction, so crossing ropes stay told apart: x the darkest,
 * a warm graphite; z a cool slate a step lighter; the uprights lightest, so
 * they stand back instead of reading as bars. Ink, then weight.
 */
const INKS = new Float32Array([
  [40 / 255, 34 / 255, 30 / 255, 1],
  [70 / 255, 76 / 255, 88 / 255, 0.62],
  [34 / 255, 44 / 255, 62 / 255, 0.75],
].flat())

const POINT_STRIDE = 9
const BEAM_STRIDE = 13

/** A rope at full pull is this many CSS px heavier than a hairline, and full is this much drawn in. */
const WEIGHT_PX = 2
const WEIGHT_PULL = 0.5

export class Renderer {
  private gl: WebGL2RenderingContext
  private lattice: WebGLProgram
  private sphere: WebGLProgram
  private pointsProg: WebGLProgram
  private beamProg: WebGLProgram
  private latticeVao: WebGLVertexArrayObject
  private posBuf: WebGLBuffer
  private squeezeBuf: WebGLBuffer
  private axisBuf: WebGLBuffer
  private linkBuf: WebGLBuffer
  private levels: Level[] = []
  private quadVao: WebGLVertexArrayObject
  private pointsVao: WebGLVertexArrayObject
  private pointsBuf: WebGLBuffer
  private beamVao: WebGLVertexArrayObject
  private beamBuf: WebGLBuffer
  private dpr = 1
  private hitBuf = new Float32Array(MAX_IMPACTS * 4)
  private hitInkBuf = new Float32Array(MAX_IMPACTS * 3)
  private canvas: HTMLCanvasElement
  /** Surface maps by url, null while on their way. */
  private maps = new Map<string, WebGLTexture | null>()
  private blank: WebGLTexture
  private aniso = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) throw new Error('WebGL2 is not available')
    this.gl = gl
    this.lattice = compile(gl, LATTICE_VS, LATTICE_FS)
    this.sphere = compile(gl, QUAD_VS, SPHERE_FS)
    this.pointsProg = compile(gl, POINTS_VS, POINTS_FS)
    this.beamProg = compile(gl, BEAM_VS, BEAM_FS)

    // One instance per segment, read straight out of the vertex buffers: a
    // segment is a vertex and the one after it. Where they start is set per
    // level at draw time, since WebGL2 has no base instance.
    this.latticeVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.latticeVao)
    const corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    this.attrib(this.lattice, 'aCorner', 2, 0, 0)
    this.posBuf = gl.createBuffer() as WebGLBuffer
    this.squeezeBuf = gl.createBuffer() as WebGLBuffer
    this.axisBuf = gl.createBuffer() as WebGLBuffer
    this.linkBuf = gl.createBuffer() as WebGLBuffer
    for (const name of ['aA', 'aB', 'aSqueezeA', 'aSqueezeB', 'aAxis', 'aLink']) {
      const loc = gl.getAttribLocation(this.lattice, name)
      if (loc >= 0) gl.vertexAttribDivisor(loc, 1)
    }

    this.quadVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.quadVao)
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    this.attrib(this.sphere, 'aPos', 2, 0, 0)

    this.pointsVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.pointsVao)
    this.pointsBuf = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuf)
    const ps = POINT_STRIDE * 4
    this.attrib(this.pointsProg, 'aPos', 3, ps, 0)
    this.attrib(this.pointsProg, 'aColor', 4, ps, 12)
    this.attrib(this.pointsProg, 'aShape', 2, ps, 28)

    this.beamVao = gl.createVertexArray() as WebGLVertexArrayObject
    gl.bindVertexArray(this.beamVao)
    this.beamBuf = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf)
    const bs = BEAM_STRIDE * 4
    this.attrib(this.beamProg, 'aPos', 3, bs, 0)
    this.attrib(this.beamProg, 'aPrev', 3, bs, 12)
    this.attrib(this.beamProg, 'aNext', 3, bs, 24)
    this.attrib(this.beamProg, 'aShape', 4, bs, 36)

    gl.bindVertexArray(null)

    // A map on unit 0 and cloud on unit 1, and a blank on each when there is
    // none, or the browser complains.
    const ext = gl.getExtension('EXT_texture_filter_anisotropic')
    if (ext) this.aniso = Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
    this.blank = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, this.blank)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    gl.useProgram(this.sphere)
    gl.uniform1i(gl.getUniformLocation(this.sphere, 'uMap'), 0)
    gl.uniform1i(gl.getUniformLocation(this.sphere, 'uClouds'), 1)
  }

  /** Fetches a body's maps, once each. */
  load(s: Surface): void {
    this.fetchMap(s.map, false)
    if (s.clouds) this.fetchMap(s.clouds, true)
  }

  /** `linear` keeps the values as they are, for a mask. */
  private fetchMap(url: string, linear: boolean): void {
    if (this.maps.has(url)) return
    this.maps.set(url, null)
    const img = new Image()
    img.src = url
    img
      .decode()
      .then(() => {
        const gl = this.gl
        const t = gl.createTexture() as WebGLTexture
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
        gl.texImage2D(gl.TEXTURE_2D, 0, linear ? gl.RGBA8 : gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        if (this.aniso > 1) gl.texParameterf(gl.TEXTURE_2D, 0x84fe, this.aniso)
        this.maps.set(url, t)
      })
      .catch(() => undefined)
  }

  /** Binds a ball's maps, or none, and says which it wears. */
  private wear(s: Surface | null): void {
    const gl = this.gl
    const sp = this.sphere
    const map = s ? this.maps.get(s.map) : null
    const clouds = s?.clouds ? this.maps.get(s.clouds) : null
    gl.uniform1i(gl.getUniformLocation(sp, 'uSurface'), s && map ? (s.glow ? 2 : 1) : 0)
    gl.uniform1f(gl.getUniformLocation(sp, 'uFace'), s ? (s.face * Math.PI) / 180 : 0)
    gl.uniform1f(gl.getUniformLocation(sp, 'uCloud'), clouds ? 1 : 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, clouds ?? this.blank)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, map ?? this.blank)
  }

  private attrib(prog: WebGLProgram, name: string, size: number, stride: number, offset: number): void {
    const gl = this.gl
    const loc = gl.getAttribLocation(prog, name)
    if (loc < 0) return
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset)
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  setNet(net: Net): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisBuf)
    gl.bufferData(gl.ARRAY_BUFFER, net.axis, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf)
    gl.bufferData(gl.ARRAY_BUFFER, net.link, gl.STATIC_DRAW)
    this.levels = net.levels
  }

  /** Points the segment attributes at a level's first vertex. */
  private segmentsFrom(first: number): void {
    const gl = this.gl
    const p = this.lattice
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    this.attrib(p, 'aA', 3, 12, first * 12)
    this.attrib(p, 'aB', 3, 12, (first + 1) * 12)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.squeezeBuf)
    this.attrib(p, 'aSqueezeA', 1, 4, first * 4)
    this.attrib(p, 'aSqueezeB', 1, 4, (first + 1) * 4)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.axisBuf)
    this.attrib(p, 'aAxis', 1, 4, first * 4)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf)
    this.attrib(p, 'aLink', 1, 4, first * 4)
  }

  setShape(positions: Float32Array, squeeze: Float32Array): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.squeezeBuf)
    gl.bufferData(gl.ARRAY_BUFFER, squeeze, gl.DYNAMIC_DRAW)
  }

  draw(f: FrameDraw): void {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    gl.clearDepth(1)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    // The body first, writing depth, so ropes and particles behind it are
    // hidden, then whatever is being ridden, the same way.
    const sp = this.sphere
    const ball = (center: Vec3, radius: number, color: Vec3, hole: boolean, glow: boolean, alpha: number, hits: number): void => {
      gl.uniform3fv(gl.getUniformLocation(sp, 'uCenter'), center)
      gl.uniform1f(gl.getUniformLocation(sp, 'uR'), radius)
      gl.uniform3fv(gl.getUniformLocation(sp, 'uColor'), color)
      gl.uniform1f(gl.getUniformLocation(sp, 'uHole'), hole ? 1 : 0)
      gl.uniform1f(gl.getUniformLocation(sp, 'uGlow'), glow ? 1 : 0)
      gl.uniform1f(gl.getUniformLocation(sp, 'uAlpha'), alpha)
      gl.uniform1i(gl.getUniformLocation(sp, 'uHits'), hits)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.useProgram(sp)
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uInv'), false, f.inverse)
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uVP'), false, f.viewProj)
    gl.uniform3fv(gl.getUniformLocation(sp, 'uEye'), f.eye)
    gl.uniform3fv(gl.getUniformLocation(sp, 'uLight'), f.light)
    gl.uniform3fv(gl.getUniformLocation(sp, 'uHot'), f.beamHot)
    gl.uniform1f(gl.getUniformLocation(sp, 'uDpr'), this.dpr)
    const hits = f.impacts.slice(-MAX_IMPACTS)
    hits.forEach((h, i) => {
      this.hitBuf.set([h.at[0], h.at[1], h.at[2], h.age], i * 4)
      this.hitInkBuf.set(h.color, i * 3)
    })
    gl.uniform4fv(gl.getUniformLocation(sp, 'uHit'), this.hitBuf)
    gl.uniform3fv(gl.getUniformLocation(sp, 'uHitInk'), this.hitInkBuf)
    gl.bindVertexArray(this.quadVao)
    this.wear(f.body.surface)
    ball([0, 0, 0], f.body.radius, f.body.color, f.body.hole, false, 1, hits.length)
    if (f.seat && f.seat.alpha > 0) {
      // Fading, it stops hiding what is behind it.
      gl.depthMask(f.seat.alpha >= 1)
      this.wear(null)
      ball(f.seat.center, f.seat.radius, f.seat.color, false, f.seat.glow, f.seat.alpha, 0)
    }

    gl.depthMask(false)

    const lp = this.lattice
    gl.useProgram(lp)
    gl.uniformMatrix4fv(gl.getUniformLocation(lp, 'uVP'), false, f.viewProj)
    gl.uniform2f(gl.getUniformLocation(lp, 'uView'), this.canvas.width, this.canvas.height)
    gl.uniform1f(gl.getUniformLocation(lp, 'uDpr'), this.dpr)
    gl.uniform3fv(gl.getUniformLocation(lp, 'uEye'), f.eye)
    // The net looks the same at every zoom, so its fog scales with it.
    const z = f.detail / VIEW_AT
    gl.uniform2f(gl.getUniformLocation(lp, 'uFog'), f.detail - 6 * z, f.detail + 8 * z)
    gl.uniform2f(gl.getUniformLocation(lp, 'uNear'), f.lens, (8 / 3) * f.lens)
    gl.uniform4fv(gl.getUniformLocation(lp, 'uInk'), INKS)
    gl.uniform1f(gl.getUniformLocation(lp, 'uBody'), f.body.radius)
    // Close in, nearly every rope on screen is pulled and the bends read on
    // their own, so the weight eases off or the room turns to charcoal.
    gl.uniform2f(gl.getUniformLocation(lp, 'uWeight'), WEIGHT_PX * Math.min(1, Math.sqrt(z)), WEIGHT_PULL)
    gl.bindVertexArray(this.latticeVao)
    // A device pixel is half as wide on a retina screen, so it gets more ink.
    const ink = this.dpr > 1.5 ? 0.2 : 0.14
    for (let k = 0; k < this.levels.length; k++) {
      const { weight, reach } = levelView(k, f.detail)
      const level = this.levels[k]
      const count = ropesWithin(level, reach[1])
      if (weight <= 0 || count < 2) continue
      gl.uniform2f(gl.getUniformLocation(lp, 'uReach'), reach[0], reach[1])
      gl.uniform1f(gl.getUniformLocation(lp, 'uAlpha'), ink * Math.min(1, 2 * weight))
      this.segmentsFrom(level.first)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count - 1)
    }

    if (f.beamCount > 0) {
      const p = this.beamProg
      gl.useProgram(p)
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uVP'), false, f.viewProj)
      gl.uniform2f(gl.getUniformLocation(p, 'uView'), this.canvas.width, this.canvas.height)
      gl.uniform1f(gl.getUniformLocation(p, 'uDpr'), this.dpr)
      gl.uniform3fv(gl.getUniformLocation(p, 'uColor'), f.beamColor)
      gl.uniform3fv(gl.getUniformLocation(p, 'uHot'), f.beamHot)
      gl.bindVertexArray(this.beamVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.beamBuf)
      gl.bufferData(gl.ARRAY_BUFFER, f.beams.subarray(0, f.beamCount * BEAM_STRIDE), gl.STREAM_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, f.beamCount)
    }

    if (f.pointCount > 0) {
      gl.useProgram(this.pointsProg)
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pointsProg, 'uVP'), false, f.viewProj)
      gl.uniform1f(gl.getUniformLocation(this.pointsProg, 'uDpr'), this.dpr)
      gl.bindVertexArray(this.pointsVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuf)
      gl.bufferData(gl.ARRAY_BUFFER, f.points.subarray(0, f.pointCount * POINT_STRIDE), gl.STREAM_DRAW)
      gl.drawArrays(gl.POINTS, 0, f.pointCount)
    }

    gl.bindVertexArray(null)
  }
}

export { BEAM_STRIDE, POINT_STRIDE }

/** Vertex count of a level's ropes that come within `reach` of the centre. */
function ropesWithin(level: Level, reach: number): number {
  let a = 0
  let b = level.miss.length
  while (a < b) {
    const m = (a + b) >> 1
    if (level.miss[m] < reach) a = m + 1
    else b = m
  }
  return a === 0 ? 0 : level.verts[a - 1]
}
