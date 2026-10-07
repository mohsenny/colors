# Gravity

**Status:** v1, built. Called Lattice until 2026-10-06; the old `lattice/` address sends on here.
**Trigger:** the rubber-sheet picture of gravity is 2D and everyone has seen it. Mohsen wants the 3D version: the kids' climbing net, rubber ropes running along X, Y and Z, with a mass in the middle that pulls every rope in. Time is shown by particles flying through the net.
**Owner:** Mohsen.
**Siblings:** the CV at the root, Solar under `solar/` and Lightbox under `lightbox/`; Gravity lives under `gravity/`. Same hand, same materials. A person landing on any of them should not need to be told they were made by the same person.

---

## 1. What it is

A room filled with a 3D lattice of thin graphite lines on Lightbox's lit white surface. One body sits in the middle. Its mass pulls the lattice in: lines bunch toward it and bend around it, gently for Earth, hard for a neutron star, and for a black hole they crowd onto an ink-black horizon.

Particles fly through the room. A probe falls, speeds up, swings round and precesses. A light pulse bends, and seen from where you sit it slows near the mass and freezes at a horizon. Each trail is a row of dots dropped at equal moments of your time, so the spacing *is* the speed: dots stretch apart where a probe races, crowd together where it crawls.

It is an instrument to look at, not a simulator to configure. It opens with probes already in orbit and the room turning slowly. Watch first.

## 2. Decisions already made

1. **Light ground, not black space.** The instinct for a space app is a black void. Lightbox's identity is the lit white surface, and the brief is one family. Grey lines on a white lightbox read like a drawing in a physics notebook, which suits a model better than a fake photo of space. A black hole becomes the only truly dark object in the room, which is the point.
2. **Real numbers in the readout, exaggerated curvature in the picture, and the exaggeration is written down.** At true scale the Sun bends space by four parts in a million: the lattice would look perfectly straight. So the picture uses a *visual compactness* (§4.1) that keeps every body in the right order and keeps black holes exact. The readout always says how much it is exaggerated (`DRAWN ×10⁵`) or `TRUE TO SCALE`.
3. **The room is framed to the body.** A preset sets the scale so the body is about two lattice cells across. Changing Mass or Size afterwards changes the body inside the same room, so you see it grow, shrink, deepen. Shrink a star far enough and it collapses into a black hole in front of you.
4. **Probes speed up, light does not.** Matter falling into a well speeds up, as you'd expect. Light always moves at c locally. Seen from far away it *slows down* near the mass (the Shapiro delay) and stops at a horizon. Both are drawn honestly and the readout says which you are looking at.
5. **One body in v1.** The classic picture has Earth orbiting the Sun. Two bodies means two overlapping wells, and the lattice has no single correct answer for that. v1 gets one body right first (see §8).
6. **No 3D library.** WebGL2 directly. What's on screen is a net of ribbons, a set of points and one sphere drawn per pixel, which three.js would only add weight to. This keeps Lightbox's "no runtime dependencies beyond React" rule.
7. **Chrome is copied from Lightbox, not reinvented.** Tokens, fibre, dock, segmented control, drawer, timeline and legend are lifted verbatim from Lightbox at `b19db57`, with the `lb-` prefix kept so a diff between `src/styles` and `gravity/src/styles` shows drift. A shared package becomes worth it when a third instrument appears.

## 3. The room

**Lattice.** Ropes on the half-steps, so no rope runs through the centre and the body sits inside a cell rather than skewered on three ropes. The net has no edge and no line count, and the spacing on screen stays about the same at every zoom, the way a map's grid does. It comes in four nested levels, 3, 1, 1/3 and 1/9 units apart, each a third of the one above with its ropes falling between the coarser ones, so no rope ever moves. Backing off hands the room to the coarser level; coming in grows the finer one out of the body, where the bending is. Each level dissolves into the surface with distance from the body. Each direction has its own grey (x the darkest, z a step lighter, the uprights lightest), and ropes between the eye and the body thin to a ghost across its face. Each rope is sampled finely where it passes the body and coarsely far out, where it barely bends.

**How the lattice is pulled in.** Near a mass there is more true (proper) distance packed into less room. Walk in from an anchor at A = 14 units (past it the net is at rest) to a rest point at radius ρ and count the extra proper distance crossed on the way; the point moves inward by exactly that much. Far out the extra is close to nothing and the rope stays put; near the body it piles up, so the ropes are drawn toward the mass and converge on it. The extra comes from Flamm's proper distance, for r ≥ r_s:

`ℓ(r) = √(r(r − r_s)) + r_s · ln(√(r/r_s) + √(r/r_s − 1))`

Inside a star's surface the map only has to stay finite and in order (those points are behind the opaque body). For a black hole anything pulled past the horizon sits just inside it, hidden by the ink sphere. The inward shift grows by less than one unit per unit of rest radius, so the map is monotonic and **ropes never cross**.

**Line tone and weight.** Graphite `rgba(26, 30, 44, a)`. Alpha falls with depth (far lines fade into the surface, like aerial perspective) and rises with local compression, so the well reads darker where the ropes converge. A rope at rest is a hairline; where the mass has pulled it in, it gets up to 2 px heavier, so the bent stretch of every rope is its boldest part and the straight runs far out recede. Close in, where nearly every rope on screen is pulled and the bends read on their own, the extra weight eases off. Depth-tested against the body.

**Body.** Matte sphere, soft key light from the upper left like the lamps in Lightbox, cool shadow side. Earth, Jupiter and the Sun wear their photographed surfaces, Solar's maps, north up the uprights; the Sun is lit from within as Solar draws it, not by the lamps. The rest keep one quiet colour per preset (§5). A black hole is `--lb-ink-strong` with a faint cool rim so it stays a sphere and not a hole in the screen.

**Camera.** Perspective, 38° field of view, orbiting the centre. Turns slowly on its own when idle and playing (as Lightbox's sheets drift on their own). Never turns under reduced motion.

## 4. The physics

Units: c = 1, length in room units, so GM = r_s / 2.

### 4.1 Visual compactness

True compactness C = r_s / R (Earth 1.4×10⁻⁹, Sun 4.2×10⁻⁶, neutron star ≈ 0.5, black hole 1). The picture uses

`c_vis = 0.16 + 0.72 · t`, with `t = clamp((log₁₀ C + 9.5) / 9.5, 0, 1)` for C < 1, and `c_vis = 1` once C ≥ 1.

So the drawn r_s is `c_vis · R`. Log-linear keeps the order of every preset and the size of the gaps between them roughly what intuition expects. Black holes are not exaggerated at all. Particles move in the *same* drawn field, otherwise they would fly straight through a bent lattice.

### 4.2 Probes (matter)

Exact Schwarzschild geodesics, written in vector form in proper time τ:

`d²x/dτ² = −(r_s/2) · x/r³ · (1 + 3h²/r²)`, `h = |x × dx/dτ|`

RK4, 8 substeps per frame. Energy E = √((u·x̂)² + (1 − r_s/r)(1 + h²/r²)) is fixed at launch. Each frame converts your time to the probe's: `dτ = dt · (1 − r_s/r) / E`. That one line gives the precessing ellipses, the innermost stable orbit at 3 r_s, the plunge, and the freeze at the horizon.

Readouts per probe: **speed** as a local observer would measure it, `√(1 − (1 − r_s/r)/E²)` (rises as it falls, reaches c at the horizon), and **clock** `dτ/dt` (how fast its own time runs compared to yours).

### 4.3 Light

The path shape is the exact Schwarzschild null orbit (Binet: u″ + u = (3/2) r_s u²), integrated by arc length with the bend `−(3/2) r_s h² x/r⁵` taken perpendicular to the direction of travel. The speed along that path is the coordinate speed of light, `√(1 − r_s/r) / √(cos²α/(1 − r_s/r) + sin²α)`, where α is the angle to the radial direction. So light skims past the Sun barely bent, wraps round a black hole near 1.5 r_s, is captured inside an impact parameter of 2.6 r_s, and visibly slows as it falls.

### 4.4 Time scale

One simulated unit per second would make Earth orbits take minutes and black-hole light cross the room in a blink. The run rate k (simulated units per second) is chosen so a circular orbit at 4 units takes 10 s, capped at 9 so light needs over a second to cross the room. Fixed step 1/60 s; deterministic, no random numbers in a tick.

## 5. Presets

| Preset | Mass | Radius | C (true) |
| --- | --- | --- | --- |
| Earth | 5.972×10²⁴ kg | 6,371 km | 1.4×10⁻⁹ |
| Jupiter | 1.898×10²⁷ kg | 69,911 km | 4.0×10⁻⁸ |
| Sun | 1 M☉ | 696,000 km | 4.2×10⁻⁶ |
| Sirius B (white dwarf) | 1.018 M☉ | 5,840 km | 5.1×10⁻⁴ |
| PSR J0740+6620 (neutron star) | 2.08 M☉ | 12.4 km | 0.50 |
| Sagittarius A* | 4.3 million M☉ | horizon 12.7 million km | 1 |
| M87* | 6.5 billion M☉ | horizon 128 AU | 1 |

The two black holes look identical. That is true, not a bug: a black hole has no scale of its own. Only the numbers in the readout differ, which is worth seeing once.

Custom: **Mass** and **Size** sliders, both logarithmic. Mass from 10²² kg to 10⁴¹ kg, Size from 1 km to 10¹¹ km. If the body leaves the comfortable band (under 0.4 or over 2.5 of the framed size) the room reframes on release and the probes are re-dealt.

## 6. Interaction

Same verbs as Lightbox wherever there is an equivalent.

| You want to | Do this | Lightbox equivalent |
| --- | --- | --- |
| Turn the room | Drag | Drag a sheet |
| Zoom | Scroll or pinch | |
| Release a particle | Double-click. A probe goes into a slightly eccentric orbit whose plane faces you. A photon starts at least five units out and heads for the mass, missing it by a throw of the dice (about one in five hits), and is ridden | Double-click takes a colour |
| Aim it | Double-click and keep holding, then drag. A dotted line shows where it will go: once round if it orbits, off the room if it leaves, to a ring on the body if it falls, and a tab names which. For a probe, two rings mark the drag for a circular orbit, one each way round; near one the aim snaps to it exactly. Inside 3 r_s there is no stable circle, and no rings | |
| Ride a particle | Click a probe; released light is ridden from the moment it is let go. It is drawn as a ball and the eye sits on it, its top filling the bottom of the screen, looking where it goes and turned in toward the mass round the closest pass, with its speed and clock pinned above it. Riding light runs the room at a quarter speed. The ride ends when it hits or leaves, and light's as soon as it is on its way out past six units. Drag looks around, scroll moves back to following it. <kbd>Esc</kbd> or a click anywhere else steps off | |
| Hold a light | Click it. Click again to let go | Click stops a sheet |
| Read a particle | Hover it. A tab shows `PROBE 0.43 C · CLOCK 0.88×` | Hex tab on a sheet |
| Stop time | <kbd>Space</kbd> | Same |
| Go back a few seconds | Drag the timeline. 15 s ring buffer, replays exactly | Same |
| Start over | <kbd>R</kbd>. Clears particles, deals three fresh probes or restarts the stream of light, recentres | <kbd>R</kbd> new colours |
| Switch Probe / Photon | <kbd>L</kbd>, or the segmented control. The room is dealt fresh in that kind | <kbd>B</kbd> Paint / Light |
| Choose a body | <kbd>1</kbd> to <kbd>7</kbd>, or the body chip | |
| Go to Lightbox | Its name, top left | Same, the other way |

Up to eight particles at once. A ninth retires the oldest, which fades out. Particles that hit a surface, cross a horizon or leave the room fade out the same way. Where one strikes, a flash and three rings in its colour spread over the surface and fade, and the timeline replays them.

**Every setup has an address.** The URL hash carries the body (`#sun`) or a custom mass and size (`#m=1.989e30&r=6.96e8`), so a link reproduces what you were looking at.

## 7. Chrome

The same places Lightbox uses, and nothing else. No header, no sidebar, no footer.

**Title, top left.** The four names, `Mohsen Solar Gravity Lightbox`, shared by every page: Helvetica medium at 22 px (18 px on a phone), tracking pulled in, no panel. The page you are on is dark grey, the others light grey, and clicking one crosses over while the words stay put. When that page is the one just behind or ahead in the tab's history, it steps there rather than loading it again, so the room comes back as it was left.

**Dock, bottom centre.** One pill, Lightbox's material exactly (panel white at 0.82, fibre, 14 px blur, float shadow). Left to right:

1. **Body chip.** A 12 px sphere in the body's colour and its name in micro-type (`SUN`). It holds the place of Lightbox's `New` fan: the one place the chrome carries colour, and the colour is the room's own. Opens the bodies drawer.
2. Play / pause.
3. Timeline. Widens when paused, the dock pins its left edge, exactly as Lightbox.
4. **Probe | Photon** segmented control: what moves in the room, and what a double-click releases. Probe is the default and comes first, and deals three probes in orbit. Photon keeps an uneven stream coming, a ray every 0.15 to 0.75 s and at most six in flight, each sent in along a random rope from either end of x, y or z, so it starts on the lattice and leaves it only where the body bends it. The two cells are made equal, since the words are not: the sliding indicator is a 50% pill.
5. Save, an arrow into a tray: the room as a PNG, as idle leaves it.
6. Plus, opening the options drawer.

**Drawers, above the dock.** Same panel, same unfold. Lightbox's rule holds: the dock is what you reach for while watching, a drawer is a decision about the instrument. The bodies drawer is a list of the seven presets, each a sphere swatch, a name, its kind in micro-type and its number key. The options drawer has **Mass** and **Size** (logarithmic sliders in the timeline's visual language: 4 px track, the paused timeline's round head; the values themselves are in the readout). Size is labelled Horizon while the body is a black hole. Letting go of a slider re-frames the room if the body has left 0.4 to 2.5 units. One drawer open at a time; pressing anywhere else or <kbd>Esc</kbd> closes it.

**Readout, top right.** Lightbox's tray card, at the same 16 px inset. Label column in micro-type, values in mono:

```
SUN
MASS        1.000 M☉
RADIUS      696,000 KM
CLOCK       0.999998×     (time at the surface vs far away)
DRAWN       ×10⁵           or  TRUE TO SCALE
```

For a black hole RADIUS becomes HORIZON and CLOCK reads STOPS.

**Legend, bottom left.** Three lines, no panel, same type:

```
DRAG            turn the room
SPACE           stop time
DOUBLE-CLICK    release, hold to aim
```

While riding it reads `DRAG look around`, `SPACE stop time`, `ESC OR CLICK step off`. Hidden under 1,004 px, where the dock would come within 15 px of it.

**Particle colours.** Light is always gold, and nothing else in the room is. Probes take the Lightbox roll at film strength, minus its amber, so the only saturated colour in the room, a photographed body aside, is on the particles and the chip. Probe trails are dots every 0.1 s for 4 s. Light is a streak with no head: widest and hottest where it has just been, narrowing and fading over 1.5 s, so a glance tells it from a probe's dots. The aim's forecast is a dotted line in the particle's colour laid evenly in space, not in time, so it is never taken for a trail.

**Idle.** Three seconds without the mouse, a touch or a key, or the window left for another, and every word and control goes, the tab on a particle and the cursor with them, playing or paused. Any of those brings them back, and a touch on an idle page does only that: the tap that wakes it does nothing in the room or on the dock. An open drawer, a press still down, the mouse resting on the chrome, or focus tabbed into it holds them. Shared with the other two (`src/ui/idle.ts`).

**Save.** A plain download, named as a Mac names a screenshot (`Gravity 2026-10-06 at 12.57.24.png`): the surface and the lattice, no words or controls. Where it goes is the browser's to say, so only a failure gets a note, over the dock. Shared with the other two (`src/photo/`, `src/ui/PhotoButton.tsx`, `src/ui/Toast.tsx`).

**Under 620 px.** Readout moves to a 10 px inset, chip shows the sphere only. Same breakpoint as Lightbox.

## 8. What's NOT in v1

- **Two bodies.** Earth around the Sun with both wells drawn. Needs an honest rule for adding two wells (superposed displacement is a picture, not physics). First v2 candidate.
- **Rotating black holes** (Kerr, frame dragging). Different metric, different lattice.
- **Lensing of the background.** There is no starfield to lens on a white surface; the light pulses carry the lensing story.
- **A clock on every lattice node** that ticks slower near the mass. Lovely, but it competes with the particles for attention. Try after living with v1.
- **Dark theme, sound, accretion discs, glow.** Restraint is the family trait.

## 9. Architecture

Same split as Lightbox: everything that moves lives outside React. React subscribes to a small snapshot.

```
src/physics/  bodies (presets, compactness, formatting), lattice (rest net + Flamm deform), motion (probe and light steps)
src/sim/      world (fixed-step particles, 15 s ring buffer, branch on resume)
src/render/   camera (orbit + matrices), gl (lines, points, sphere impostor), maps (Solar's, for the Earth, Jupiter and the Sun)
src/app/      instrument (rAF loop, playback, pointer and keys, URL), snapshot for React
src/ui/       Dock, Bodies, Options (with its slider), Timeline, Readout, Legend, Sphere, Icons
src/styles/   global.css and ui.css from Lightbox, plus stage.css for the surface
```

Lattice deformation runs on the CPU (about 270k vertices, a table lookup each) and only when mass or size change; the GPU just draws. History is the trail source: trails are read back out of the ring buffer, so scrubbing restores trails for free.

## 10. Acceptance

Physics, as unit tests:

- Far from the mass a circular-orbit launch stays within 1% of its radius for five orbits.
- A probe launched at circular speed inside 3 r_s does not stay in orbit; one outside does.
- Light with impact parameter 2.5 r_s is captured; 2.7 r_s escapes.
- The aim offers a circle only outside 3 r_s, and never calls a path that meets the surface an orbit.
- Weak-field light deflection within 10% of 2 r_s / b.
- Perihelion advances in the direction of motion.
- Lattice map is monotonic in radius for every preset and never pushes a point outward outside the body.
- Visual compactness is strictly increasing from Earth to the neutron star, and exactly 1 for a black hole.

By eye, on a 2020 MacBook Air at 1440×900:

- 60 fps zoomed all the way out, with eight particles.
- Earth's lattice is visibly but gently pulled; the neutron star's clearly bunches; the black hole's crowds onto the horizon.
- Put next to Lightbox, the dock, drawer, card and legend are indistinguishable in material and type.

## 11. Running it

From the repo root: `npm run dev` and open `/gravity/`. Tests, lint, typecheck and the build cover every page, and Pages deploys them all from `main`.
