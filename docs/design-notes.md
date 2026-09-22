# Lightbox design notes

Two authoritative specs. Part 1 (rendering) and Part 2 (motion, palette, history).
Implementers follow these literally. Where a spec gives a number, use that number.

---

# Part 1. Rendering and compositing

## 1.1 Why DOM/CSS and not canvas

The optical model in Part 2 composites stacked gels as a plain product of their
effective (already density-adjusted) colours in encoded sRGB. CSS
`mix-blend-mode: multiply` *is* that product, computed on the GPU. Verified:
`#fbecac x #ffceb5 = #fbbf7a`, an unambiguous orange, which is the yellow-over-red
requirement. So the browser's own compositor gives us the physics for free, and in
exchange we keep real text, real focusable buttons, real focus rings and crisp
hex labels that rotate with their slide. A canvas would have to re-implement all
of that and would still need a DOM overlay for the controls.

## 1.2 Stacking, the one rule that makes or breaks this

`mix-blend-mode` blends an element with the backdrop **of its stacking context**.
`transform` creates a stacking context. Therefore a coloured layer must never be a
*child* of a transformed slide wrapper. It would be sealed off and blend with
nothing. Every layer is a direct child of `.stage`, transformed individually, and
paint order is controlled with `z-index` only. DOM nodes are never reordered.

`.stage` itself sets `isolation: isolate`, so the blending never escapes to the page.

## 1.3 Layer model

Per slide, four sibling elements, all `position: absolute; left: 0; top: 0` and
all positioned with

```
transform: translate3d(Xpx, Ypx, 0) rotate(Rrad) translate(-50%, -50%)
```

(rightmost applies first: centre the element on the origin, rotate about that
centre, then move it into place). `z-index = 10 + zRank * 8 + layerOffset`:

| offset | element  | blend    | geometry                     | purpose |
|--------|----------|----------|------------------------------|---------|
| 0 | `.film`  | multiply | `(w - 2f) x (h - 2f)` px | the transparent dye. `opacity = 1 - modeMix` |
| 1 | `.veil`  | screen   | same as film | interface scatter: a 3.2% white lift so 3- and 4-stacks stay luminous instead of collapsing to sludge. `opacity = 1 - modeMix` |
| 2 | `.ink`   | normal   | same as film | Mode B's flat screen-printed panel. `opacity = modeMix * alphaB` |
| 3 | `.frame` | normal   | `w x h` px | the white mount: `border: f solid`, transparent interior, carries both shadows and the tab |

`f` is `FRAME_PX` and is **constant in CSS px**. Resizing changes `w`/`h` only, so
the mount stays the same thickness while the colour area grows. Depth is never
expressed as `scale()` for the same reason.

Only `.frame` receives pointer events; the three colour layers are
`pointer-events: none`. Hit testing is then native and automatically respects
z-order: the visually topmost frame wins.

## 1.4 Slide anatomy

- Outer corner radius 3px, inner radius 1.5px.
- Frame: `rgba(255,255,255,0.955)`. Transparent interior (border only): a filled
  white background would multiply against white and kill all cross-slide blending.
- Outer lip: add `0 0 0 0.5px rgba(30,34,48,0.055)` as the first box-shadow. That
  1/2px darkening at the edge is the single cue that reads "card" rather than
  "white rectangle".
- Inner lip: `.film` and `.ink` each carry
  `box-shadow: inset 0 0 0 0.6px rgba(0,0,0,0.045)`. On the multiply layer this
  darkens the film's own edge, the cue that the film is seated in a mount.
- Tab: child of `.frame`, `width: min(56px, w * 0.62)`, height 18px, radius 3px,
  `top: -14px` so it stands 14px proud with a 4px overlap onto the frame. Its
  horizontal position is staggered per slide along the ladder
  `[0.26, 0.42, 0.58, 0.74, 0.34, 0.66]` of the inner width, clamped in px so it
  stays inside the frame: all six centred means two crossing slides hide each
  other's hex, and a hex you cannot read is a functional failure. Filed slides
  and folder tabs are staggered for exactly this reason. Same white as the frame, its own small shadow
  `0 1px 2px rgba(30,34,48,0.10)`. Holds the hex label and, when selected, the
  copy and lock buttons.
- Hex label: `ui-monospace` 10.5px, `letter-spacing: 0.09em`, uppercase,
  `rgba(26,26,30,0.72)`. Selected: `rgba(16,16,20,0.95)` and weight 600.

## 1.5 Shadows

Two lobes per slide, both on `.frame`. `hmm = 1.6 + 5.2 * z` (a notional height in
millimetres):

```
soft:    blur = 3 + 4.0*hmm          offsetY = 1.6*hmm    offsetX = 0.35*offsetY
         alpha = 0.155 - 0.0105*hmm
contact: blur = 1.5 + 0.6*hmm        offsetY = 0.4*hmm    offsetX = 0.35*offsetY
         alpha = 0.10 - 0.008*hmm
colour:  rgba(46, 52, 72, alpha)
```

Note the alpha *falls* as the slide rises while the blur *grows*. That inversion is
what reads as a physical object a few millimetres above a lit surface; a shadow
that just gets bigger and darker reads as a web card. The colour is deliberately
cool against the warm surface: that is the signature of a lit box in a room.

## 1.6 The lightbox surface

Extremely bright, but never flat `#fff` and never an obvious radial gradient.
Total luminance swing across the viewport must stay under ~3.5%, so it reads as
"lit" rather than as a shape. Layers on `.stage`, bottom to top:

1. Base `#fbfaf8`.
2. A chroma tilt, warm to cool along ~118deg: `rgb(252,249,243)` to
   `rgb(244,247,253)`. Pure neutral near-white always reads as a screen; a 0.8%
   chroma tilt reads as a surface. This layer does more work than any other.
3. A broad bright lobe at 28% 18%, and a broad slightly darker lobe at 81% 86%.
   Both must be wide enough (>=140% of the viewport) that no edge is perceivable.
4. The rim: four short linear falloffs, 3.5% of the width at the sides and 5 to
   5.5% of the height top and bottom, `rgb(223,229,240)` under 2% strong. A panel
   loses light where it meets its housing, and the falloff is what says "surface
   with edges" instead of "page that happens to be white".
5. THE TUBES. Two implied lamps at 27.5% and 72.5% of the height, each a narrow
   core (rx 50 to 52% of the width, ry ~2%) inside a broad halo (rx 76 to 78%,
   ry 20 to 21%). Both ellipses are NARROWER than the viewport on purpose: the
   streak has to fade out before the edges, because a band running edge to edge
   reads as a gradient and a band with ends reads as a fixture. This is what
   makes the surface a lightbox rather than a bright background. Making room for
   it cost the base about 1% of luminance.
6. Grain: a static `feTurbulence` data URI at about 4% opacity, multiply, 1 CSS px
   cell. Static, never animated: animated grain shimmers when the user pauses,
   which is exactly when they are studying a colour.

Measured profile at 1440x757 (luminance, slides hidden): 251 at the upper tube,
250 at the lower, 245 in the gap between them, 244 at the left and top rims, 239
at the bottom-right corner. Total swing ~4.7%, structured rather than smooth.

## 1.6b Material

Nothing in the piece is a flat fill. One shared fibre (`--lb-fibre`, an
`feTurbulence` whose RGB is constant and whose alpha caps at 0.1) appears on
every surface that is supposed to be a physical object: the mount, the tab, the
dock, the tray. The tone always comes from what is underneath, so the same token
works over an opaque tab and a blurred translucent panel.

- **The mount** needs the fibre ABOVE its border, not under it: the mount is
  95.5% white over the surface, so a texture painted beneath arrives at 4.5%
  strength. `.lb-frame::before` is sized to the border box and masked to the ring
  with `mask-clip: border-box, padding-box` + `mask-composite: exclude`, which
  keeps the film (a sibling BELOW the frame) visible through the middle and keeps
  the corner radius. Not `border-image`: slicing repeats a sub-region of the noise
  tile rather than the tile, and the seams read as a grid at any zoom.
- **The film** carries a 148deg sheen, about 5% white at the top-left falling to
  2% black at the bottom-right. White means less dye, so the sheet thins where the
  light catches it. It is the difference between a colour and a colour on
  something.
- **Type** is the same voice everywhere: uppercase micro-labels with 0.09 to
  0.185em tracking (wordmark, mode toggle), and hex in mono with
  `font-variant-numeric: slashed-zero tabular-nums`. The slashed zero is the one
  typographic tell that says instrument rather than website; tabular figures stop
  the tab jittering as digits change.

## 1.7 The two modes

Both derive from the same six dyes, and the switch is a crossfade of layer
opacities, never a discrete blend-mode swap (a multiply layer at opacity 0 is
exactly identity, so the crossfade is clean).

- **Light** (`modeMix = 0`): `.film` at full opacity, multiply. Stacking is a
  product of transmittances, so overlaps read as real gels over a backlight.
- **Blend** (`modeMix = 1`): `.ink` at `alphaB`, normal. Flat screen-printed
  panels: higher chroma, harder edges, and z-order becomes the dominant reading.
  The 1px registration hairline on `.ink` is what stops it reading as a retreat
  to plain alpha-over.

## 1.8 Selection, hover, resize

- Hover: frame brightens slightly, cursor `grab`.
- Selected: frame border goes to `rgba(255,255,255,0.99)`, a hairline graphite
  ring `0 0 0 1px rgba(26,30,44,0.18)` joins the shadow stack, the tab widens to
  fit the copy and lock buttons, and the hex gets heavier. No blue box and no
  scaling. The slide is also lifted to the top of the
  pile, the way you would pull one slide out of a stack to read it. In Light that
  is very nearly invisible, because the dye layers are a product and a product
  commutes: only the 3% screen veil does not. In Blend the layers composite
  normally, so the lifted slide really does come forward, which is the correct
  reading of having picked it up.
- Resize: one small grip at the bottom-right corner of `.frame`, visible only when
  selected. Dragging maps the pointer's distance from the slide centre onto the
  slide's local diagonal and rewrites `sizeFrac`. Aspect is preserved; frame
  thickness is untouched by construction.
- Everything on the tab must stop event propagation so that copying or locking
  never re-selects or deselects.

### Hold on select, and drag to move

The brief said nothing but Pause may ever freeze a slide (its sections 8 and
25). That rule did not survive use, and it is deliberately overridden: selecting
a slide now stops that one slide where it stands, `SlideState.held`, while the
other five keep drifting.

The reasons, in order. A colour you are trying to read, copy or grab slides out
from under the pointer the whole time it is moving. Pausing everything to
inspect one thing kills the composition that made you curious in the first
place. And a slide that holds still under the hand is what makes it graspable:
picking one up and selecting it are now the same gesture, which is why the
cursor is `grab` rather than `pointer`.

So pressing anywhere on `.lb-frame` selects, holds, and starts a move drag. The
grab offset is captured on pointerdown and the slide is placed by its centre for
the rest of the drag, which only holds because the slide is already stopped.
Release leaves it where it was dropped; deselect and it carries on from exactly
the heading it stopped on.

Three things this touches:

- `held` is not in the history ring, for the same reason `locked` is not. The
  ring records where a slide *was*, and a held slide simply was in one place for
  a while, which replays correctly on its own. A scrub must never let go of a
  slide the user is holding.
- Taking hold commits the branch, like every other mutation that writes
  simulation state. Mid-replay the positions come out of the ring, so without
  the commit a held slide carried on sliding and the click looked ignored.
- A slide-count change (`onViewportResize`) clears the selection. Carrying the
  id over would leave a stranger frozen on a rebuilt layout.

Both are cheap to revert if the brief's original rule is ever wanted back:
delete the `held` early-continue in `Simulation.advance` and the `setHeld` call
in `Instrument.select`.

## 1.9 Performance

Six slides is 24 absolutely positioned nodes and roughly 30 style writes per
frame, which is trivial. The real budget is the 12 blended layers; keep them to exactly
the film and veil, never add more. React must not render the stage: the stage is
imperative and owns its own DOM. React renders only the dock, the timeline and
the tray, and re-renders only on user intent.

---

# Part 2. Motion, palette and history

# motion-palette track: authoritative spec

Owns: `src/core/` (rng, oklab, noise), `src/sim/` (seed, step, bounce, history), `src/palette/`.
Does NOT own: DOM/CSS structure, lightbox surface, grain, scrubber UI. This track exposes a plain
object graph (`SimState`) plus derived colour records; the render track reads them and never writes them.

Existing `src/core/rng.ts` (`Rng`, mulberry32, `state` get/set) is the only PRNG. Do not add another.

---

---

## Tuned constants (reference dump)

```
TIMING
DT = 1/60 s; max 4 substeps/rAF; CAP = 900 frames = 15.0 s; stride = 8 + 28*slideCount lanes (176 at 6 slides,
  1408 B/frame, 1.27 MB), one Float64Array allocated once
mode crossfade 420 ms cubic-bezier(0.4,0,0.2,1)
palette reroll: 520 ms per slide, 46 ms stagger, deepest-first, 750 ms total; hue easeOutQuint, L/C/d easeInOutCubic
resize debounce 250 ms, ignore below 2% change, ring cleared, scrubber fade 300 ms

SEEDING
size ladder (fractions of S=min(W,H)) [0.46,0.38,0.33,0.29,0.25,0.21], used as written, clamp [120, min(560, 0.82S)] px
  (the ladder is the only sanctioned overlap knob, so it stays crisp; the +/-4% jitter was dropped because it
   blurred the hierarchy and the aspect list already supplies the irregularity)
aspect list [1.00,1.00,1.34,0.78,1.18,1.00], area-preserving
depth z_i = clamp((rank+0.5+0.35*spread)/6, 0.02, 0.98); rank sort key = sizeRank + 0.8*rng
placement origin C0 = (A*(0.42+0.16u), 0.44+0.14u) plus phases p1,p2. C0 seeds the opening positions and
  bearings and then stops mattering: steering is per-slide homes, see STEERING.
golden angle 0.6180339887; radius multiset [0.58,0.66,0.92,1.04,1.15,1.42]; inset 0.06u; max 6 theta re-rolls
heading = bearingToC0 ± (62 + 56u) deg, reject within 10 deg of an axis, max 8 re-rolls
speed0 = (0.038 - 0.019*(1 - sizeNorm))*(0.82+0.36u) u/s, clamp [0.016, 0.044]  (17-36 px/s at H=900),
  sizeNorm = depthRank/(count-1), so the small deep slides are the slow ones. Measured mean instantaneous
  speed 25.7 px/s over 6 seeds x 180 s, up from 18.3: the first pass was hypnotic to the point of inert
rot0 = ±14 deg; omegaRot0 = ±(0.18 + 0.85u) deg/s
acceptance: 4.0 s @ dt 1/30, need >=2 pairs and at least one triple at some point in the window, and
  max O_i <= 2.6 at t=4; 24 attempts, best-scoring kept if none passes. "Overlap" is the proxy-disc test
  d < 0.85*(r_i + r_j), the same test the overlap statistics use.

STEERING (deg/s, sum clamped +/-4.2)
wander 1.8*(2*nHdg-1), nHdg = 0.65*vnoise(t/9.0) + 0.35*vnoise(t/23.0), 32-entry tables
home 1.2*smoothstep(0.42,1.0,r) toward a per-slide home, r measured per axis (dx/(A/2), dy/0.5).
  Each slide gets its OWN orbit: rate, radius and centre all vary, from two irrationals so they cannot
  correlate. Six orbits of one radius about one centre is a hexagon, and a hexagon that turns is still a
  formation however slowly it shears. This is half of what used to read as "they move as a clump".
  f1 = frac(0.382*i), f2 = frac(0.755*i)
  rate_i = 0.011*(0.45+1.6*f1)*(i even ? +1 : -1)    -> a lap takes four to twenty minutes
  ring_i = 0.62*(0.55+0.85*f2)
  centre_i = (0.5 + 0.1*cos(2pi*f2+p2), 0.5 + 0.1*sin(2pi*f1+p1))
  th = 2pi*frac(0.618*i) + p1 + rate_i*t; wobble 0.18*sin(0.013t + p2 + 2pi*f2) on the y term only
  home_i(t) = (A*(cx + 0.31*ring_i/0.62*cos(th)), cy + 0.31*ring_i/0.62*sin(th + wobble))
  the leash is LED by ±0.55 rad (sign by parity), not aimed, so the approach spirals in
anti-axis 1.6*(1 - |gap|/14 deg) away from the nearest 90 deg axis, inside a 14 deg window; ties break on
  slide parity, never on a draw, because a plain tick must not touch the PRNG
crowd: trigger O_i>1.25, gain 1.6*smoothstep(1.25,2.0,O_i), hard 2.4 above O_i=2.2
sticky: the other half of the clumping. Two slides that overlap have NOTHING pushing them apart, because
  the crowd term needs an occupancy a single pair can never reach: measured mean overlap dwell was 13.8 s
  and the worst case 34 s, which is what reads as a clump rather than as a crossing. Per-pair clock, not a
  new force: timer rises while O_i>0.1 and unwinds at 2x once clear, and after 2.5 s of unbroken contact
  the slide steers off the weighted overlap centroid at 2.8*smoothstep(2.5,5.0,timer) deg/s. Same bearing
  as the crowd term, so they simply sum. It shortens overlaps without making them rarer, which is the
  point: dwell mean 9.3 s, p90 17.2 s, 45% MORE distinct encounters, cluster-of-4-or-more still 1.0% of
  frames. `stickyTimer` is in the history ring (lane 26) so a scrub restores it.
lonely: O_i<0.05 for 6.0 s -> 0.9 deg/s toward nearest until O_i>0.35
speed breath (0.82+0.36*vnoise(t/13.0)); depth speed (0.88+0.24z)
rotation breath (0.7+0.6*vnoise(t/17.0)); restoring beyond 22 deg at 0.05 deg/s^2
occupancy proxy radius r_i = 0.45*(w+h)/2*0.9
depth ease tau 2.2 s

BOUNCE (6 draws, fixed order)
restitution via speed jitter *U(0.88,1.12) clamped [0.012,0.030]
angle jitter U(-14,+14) deg
anti-axis-lock: |angle off normal| clamped to [12 deg, 82 deg]
omegaRot += U(-0.5,0.5), clampAbs 2.0, minimum magnitude 0.15
zTarget += U(-0.18,0.18), clamp [0,1]
soft catch p = 0.06, speed0 *= 0.45, recovers over 0.9 s
per-wall cooldown 0.25 s; depenetrate + 0.5 px; full containment of frame+tab union AABB

SHADOW / DEPTH
hmm = 1.6 + 5.2z (1.6..6.8)
blur = 3 + 4.0*hmm px (9.4..30.2); offsetY = 1.6*hmm (2.6..10.9); offsetX = 0.35*offsetY
alpha = 0.155 - 0.0105*hmm (0.138..0.084)
contact: blur 1.5+0.6*hmm, offsetY 0.4*hmm, alpha 0.10-0.008*hmm
film luminance lift 0.02*z; z-index = 10 + zRank*8 + layerOffset (see 1.3); the SELECTED slide is ranked
  above every other, because .frame is the only hit-testable layer and a selected slide low in the stack
  had its own tab, copy and lock buried under the slide above it

PALETTE  (recalibrated twice against the film model; the original numbers produced six pastels)
dye L in [0.46,0.90], C <= 0.33; density d in [0.34,0.95], plain slides U(0.74,0.96) - 0.12*areaNorm clamped [0.75,0.95]
L bands 0.56 / 0.70 / 0.83 (+/-0.025); slot 0 takes the floor and slot 1 the ceiling, the rest draw
  0.22 / 0.52 / 0.26 across the three, then the slots are shuffled
chroma bands 0.09 / 0.15 / 0.21 / 0.27 (+/-0.018), ABSOLUTE chroma, not a fraction of maxChroma(L,h):
  a fraction sounds right and is not. At L 0.82 sRGB reaches C 0.26 for a green and C 0.10 for an orange,
  so the same fraction buys a vivid green and a dead orange, and four slides in six came out as tints.
  Ask for an absolute chroma and let the LIGHTNESS follow the hue: lightnessFor(h, C, want) searches
  outward from `want` in 0.02 steps until the hue has the headroom. That is what dyed film does anyway,
  a deep orange gel is darker than a deep yellow one because dark is the only place that orange exists.
  This replaces the anti-correlated L/saturation pairing, which is now gone: lightnessFor subsumes it.
slot jitter: h +/-6.5 deg, L +/-0.025, C +/-0.018; offsets *U(0.85,1.15)
base hue drawn ONCE per roll, before the 56 candidates, not per candidate: when each candidate drew its
  own, the tournament was choosing the hue family too, and because magenta pairs multiply to high chroma
  the score kept crowning them. The instrument had developed a house colour.
strategy weights: warm/cool 0.26, complementary 0.20, analogous 0.20, split-comp 0.16, cluster+far 0.12, mono+foil 0.06
roles scale with palette size, quietSlots(n) = 2 at n>=6, 1 at n>=4, 0 below:
  neutral gel (C=0.045, d=0.55) on a slide drawn from the three ranks around the median area, shuffled per
  roll: the median slide every time is the predictable symmetry the brief rules out, and the top of the
  ladder is excluded because a large near-neutral reads as grey paper; one wash (d*=0.70, C*=1.30);
  one accent (C*=1.20)
constraints, judged on the EFFECTIVE film colour wherever more than one slide is involved:
  minGap>=13 deg; maxGap<=150 (strategies 1/3/5/6) or 215 (2/4); L range [0.10,0.40]; stdev(L) [0.038,0.120];
  a neutral only required when quietSlots>=1 (min effC <= 0.045); >= n - quietSlots(n) - 1 slots at effC >= 0.085;
  stdev(effC) >= 0.026 at n>=4; every pair L_mix>=0.50; every pair (C_mix>=0.030 OR L_mix>=0.66);
  worst triple L>=0.36; worst 4-stack min encoded channel >=0.04; sum(clip)<=0.10; novelty >=24 deg
score weights: 2.6 meanPairChroma (normaliser 0.19), 1.4 presence, 1.2 bestPairChroma, 1.0 hueBalance,
  0.9 chromaSpread, 0.7 lightnessShape, 0.6 worstPairChroma, 0.5 warmthBias, -1.6 clip, -1.1 mud
selection: 56 candidates (0.9 ms), one 15%-relaxed retry, lottery over top 6 with [0.27,0.22,0.18,0.14,0.11,0.08]
measured over 4000 consecutive rolls at 6 slots: 100% clean, the relaxed retry never needed.
  That rate on its own proves nothing, because generatePalette returns a legal candidate by construction.
  What shows the constraints are alive is the candidate pool: across all 224,000 candidates they reject
  pairMud 42%, minGap 33%, maxGap 31%, lStdevHigh 25%, pairDark 10%, tooFewSaturated 5%, tripleDark 1.8%,
  lRangeHigh 1.6%, the rest under 0.5%. To re-measure, instrument a COPY of the generator; instrumenting
  the real one only ever tells you what you already know.
Mode A: fill = encode(1 - d*(1 - dyeLinear)), mix-blend-mode multiply
Mode B: oklch(clamp(L-0.14, 0.50, 0.78), C*1.15, h), normal, alpha = 0.62 + 0.20*(d-0.42)/0.28, plus 1 px inner
  registration hairline at full-density colour, alpha 0.9
verified numbers: yellow oklch(.90 .17 100)@.62 = #fbecac; red oklch(.80 .19 55)@.62 = #ffceb5; stacked = #fbbe78
  (L .843 C .112 h 69); complementary @.50 = #bcc3c7 (fine); complementary @.70 = #958d93 (mud)
Mode B samples: #c9b200, #dc7100, #008ff5, #38be64

BUFFER LANES  (one Float64Array, not the aliased Float32/Uint32 pair originally planned:
  Float32 cannot hold a uint32 rngState exactly, and an inexact rngState means scrub-resume diverges)
globals 0..7, four in use: t, aspect, modeMix, paletteEpoch
slide base 8 + i*26, lanes: x, y, heading, speed0, rot(unwrapped rad), omegaRot, sizeFrac, aspect, w, h,
  z, zTarget, dye.L, dye.C, dye.h, dye.d, tweenT, tweenDelay, lonelyTimer, cd0, cd1, cd2, cd3,
  rngState(u32), catchUntil, speedPre
`locked` is deliberately absent: locking is user state, so scrubbing must never unpin a colour.
dyeFrom/dyeTo are absent too, because a regenerate always commits a branch, so the retained window
only ever contains one tween's endpoints.

CALIBRATION TARGETS
mean 2.2-2.8 overlapping pairs; 3-stack 15-25% of time; 4-stack <8% and never >4 s; 6 connected <0.5%;
no slide within 0.02u of a wall for >2 s
plus two that the overlap targets above do not imply, and which a clumped composition passes anyway:
  every cell of a 4x3 grid sees a slide centre within 4 minutes; spread (mean distance from the centroid
  over the half-diagonal) median > 0.26, p05 > 0.15. The p05 floor is deliberately low: a brief huddle is
  where the overlaps come from, what must not happen is a permanent knot.

MEASURED (three seeds, 1440x900, 4 minutes each)
axis dwell 5.5 / 3.4 / 4.4% of ticks; spread median 0.288 / 0.346 / 0.331; some overlap on 93 / 91 / 96%
  of frames; grid coverage 12/12 on every seed
portrait 390x844 at 4 slides, sampled live in the browser for 30 s: overlapping pairs 0 on 8% of samples,
  1 on 30%, 2 on 38%, 3 on 13%, 4 on 10%; nothing ever crosses the viewport edge
```

---

## Pitfalls, read before writing a line

- Do not call the RNG in a plain tick. Every continuous variation comes from the seed-derived value-noise fields, which are pure functions of (seed, slideIndex, t). The moment a tick draws a random number, the one-u32-per-slide snapshot stops being sufficient and scrub-resume silently diverges.
- Do not store rotation wrapped to [0, 2pi) or in degrees mod 360. Store it unwrapped in radians. A wrapped angle produces a 350-degree spin artefact the instant a scrub interpolates across the wrap.
- Do not express depth as transform: scale(). It would breathe the white frame thickness and break the constant-frame requirement. Depth affects shadow, paint order, speed and a 2% luminance lift only.
- Do not resize a slide by scaling the whole element. The interior grows; the frame is a fixed CSS px border and the tab is a fixed px block. Store size as a fraction of min(W,H) and recompute px each resize.
- Do not run the 56-candidate palette loop inside a rAF callback. It is ~1000 OKLab conversions, 2-4 ms, and belongs on the reroll event before the next frame.
- Do not skip the anti-axis-lock rule in the bounce. Without it slides ping-pong on one axis or skate along an edge within the first minute, and no amount of good colour rescues that read.
- Do not let a slide half-exit the viewport. Containment uses the rotated AABB of the frame-plus-tab union; an off-screen tab is an unreadable hex code, which is a functional failure, not a stylistic one.
- Do not reject every neutral pair crossing. A pale neutral (#bcc3c7, L 0.81) is a photographic cue and should survive; only a dark neutral (#958d93, L 0.72) is mud. The constraint is conditional on lightness, and flattening it to a plain chroma floor will make every palette warm-analogous.
- Do not give large slides high density. Density is biased inversely with area; a big dense slide reads as coloured paper and kills the film illusion faster than any other single mistake.
- Do not implement the mode switch as a discrete blend-mode swap. Use two stacked interior layers, multiply at opacity (1 - modeMix) and normal ink at opacity modeMix*alphaB. A multiply layer at opacity 0 is exactly identity, which is what makes the crossfade clean.
- Do not drop the neutral-density gel on the median-area slide at six slides. It is what stops six tinted rectangles reading as a toy, and it is also how the low-chroma constraint is satisfied by construction rather than by luck. It does have to scale down, though: the gel and the wash together are two of six, which is a composition, but two of four is half a phone screen with no colour in it, and it made the saturation constraint unsatisfiable. See quietSlots().
- Store the resolved dye per slide in the ring, not a paletteSlot index into a side table. The side-table plan was dropped: a locked slide keeps its dye across a reroll, so slot indices stop identifying a colour the moment the user pins anything, and the ring would restore the wrong colour. paletteEpoch is still recorded so the UI can tell which generation a scrubbed frame belongs to.
- Do not truncate the history ring the moment the user releases the scrubber. Truncate lazily on the first tick that actually advances, so scrubbing back and forth while paused stays lossless.
- Do not retune the five steering gains to fix the overlap DISTRIBUTION (how many slides overlap at once). They are coupled; the only sanctioned knob there is the size ladder multiplier. Overlap DURATION is a separate problem with its own knob: see the sticky term.
- Do not read a flock order parameter of 0.37 as evidence of flocking. For n=6 random headings the chance value is already about 0.36, so that number is the null result, not the finding. When the brief's complaint is "they move as a clump", measure the two things that actually produce the read: how long one pair stays overlapped (dwell) and whether the home targets share an orbit. Both were the cause here; heading correlation never was.
- Do not expect the crowd term to separate a PAIR. Its trigger is an occupancy two slides cannot reach on their own, so a pair rides along until something else interrupts: mean 13.8 s, worst 34 s. Pairs need their own clock, which is what sticky is.
- Do not steer every slide toward one shared point. A single attractor plus an isotropic leash confines the whole set to a disc, and on a 16:10 box that leaves the rim permanently empty: the overlap statistics stay perfect while the composition reads as a clump in a large blank room. Give each slide its own slowly orbiting home and measure the leash per axis. The test that catches the regression is grid coverage, not overlap count.
- Do not aim the leash at the home point. Steering straight at a point parks the slide on whatever heading joins the two, and often enough that is horizontal: axis dwell went from 5% to 13% on one seed. Lead the target so the approach spirals.
- Do not rely on the bounce's anti-axis-lock alone. It only fires on contact, so a slide that was slowly *steered* onto a horizontal heading sits there with nothing to push it off. Steering needs its own anti-axis term. With both, measured axis dwell is 3 to 6% per seed; with only the bounce guard one seed in three spent 12%.
- Do not put the near-neutral gel on the same slot every roll. It is a deterministic symmetry, and it is visible: the same slide went grey on every reroll in a contact sheet of thirty palettes. Shuffle within the three ranks around the median area, and keep it off the largest slide, which would read as grey paper.
- Do not centre every tab. See 1.4. Staggering is not decoration; a hex hidden by a crossing slide is a control the user cannot reach.
- Do not treat a 100% clean palette rate as evidence the constraints work. The generator returns a legal candidate by construction, so the only honest measurement is over the candidate pool, taken from an instrumented copy of the generator.
- Do not leave the scrubber at its playing width when paused. Paused is the state where the scrubber is the reason the user came to the dock; "minimised but available" is the playing state. It widens from 132px to 304px, and on a small viewport to `min(304px, 100vw - 196px)` so the dock still fits a phone.
- Do not let the dock grow from its centre when the scrubber opens. Centred growth moves the play button 86px left, out from under the pointer that just clicked it, and what lands under that pointer is the scrubber: the next click scrubs the composition backwards instead of resuming. The dock offsets by half the growth so the left edge and the play button stay put and the panel opens rightward. It costs an 86px off-centre dock while paused, which is the cheaper of the two. Phones are the exception: the paused dock is already nearly viewport-wide there, so it keeps growing from the centre.
- Do not click a cached coordinate in the browser QA scripts. Re-read the control's rect immediately before every click. Four "the app is frozen" failures were all one stale play-button coordinate landing on the widened scrubber, and the app was fine.
- Do not paint the mount's texture underneath its border. See 1.6b. The mount is 95.5% white, so it swallows 95.5% of anything below it.
- Do not texture a border with `border-image`. Slicing repeats a sub-region of the noise tile, not the tile, so the result is a visible grid of seams, and border-image also drops the corner radius.
- Do not let the palette generator run with a variable draw count per bounce. Always draw for the anti-axis-lock tiebreak and discard it when unused, so stream position is a pure function of contact count and can be asserted in a test.
