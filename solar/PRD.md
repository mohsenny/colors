# Solar

**Status:** v1, built.
**Trigger:** Mohsen's idea for a third instrument beside Lattice: our solar system, with the planets where they really are, at their real sizes and distances, and a clock that runs fast or backward. True scale is mostly empty space, so rather than flying through it you become a body and look at the others from there. Jump to the next eclipse and watch it happen.
**Owner:** Mohsen.
**Siblings:** Lightbox at the root, Lattice under `lattice/`, Solar under `solar/`. Same hand, same chrome, with the lights out.

---

## 1. What it is

The Sun, the eight planets and the Moon where they are right now, at their true sizes and distances, each wearing a photographed map of its surface. It opens on the Earth looking at the Moon, at real speed.

You are always on a body, the seat. Looking at another body, you sit just above the seat with its horizon low in the frame and the other body in the middle, the way that planet's own sky would show it. Look at the seat itself and you circle it as a globe. Double-click anything to become it, and the eye flies there.

Speed the clock up and the sky starts to move: the Moon's phases, the Earth turning its cities into the night, Venus swinging from evening to morning, Mars looping backward. Every frame is the real geometry for that moment.

## 2. Decisions already made

1. **Real positions from a real ephemeris.** Astronomy Engine: VSOP87 for the planets, ELP for the Moon, the IAU's rotational elements for which way each body is turned, within an arcminute of JPL Horizons. It is the one runtime dependency besides React anywhere on the site, and Solar's alone. A planetary theory written by hand is weeks of work and a quiet source of wrong answers, and the eclipse searches come with it. MIT, no dependencies of its own. The clock runs from the year 1000 to 3000.
2. **True scale, made navigable by becoming a body.** Put the Sun on a screen at true scale and Neptune is a speck a kilometre away; no zoom shows both. So you never fly a camera through the gaps. You sit on a body and look out, and distance stops being a navigation problem and becomes what you see: Jupiter from the Earth is a 34″ disc that needs a telescope lens, the Earth from Mars a bright star with the Moon beside it.
3. **One zoom axis: a telescope one way, backing away the other.** Scrolling in narrows the lens to a twentieth of a degree, about a good amateur telescope. Scrolling out widens it to 46°, then backs away from the seat, as far as 40,000 of its radii, until whole orbits fit. Looking at a body sets the lens so it is an eighth of the frame across.
4. **The horizon is placed, not stumbled on.** The seat's horizon sits 0.56 of the half height below the target (drag to move it), worked out exactly even when the target is only a few dozen radii away, as Mercury is from the Sun. Where the seat has air, a lens too narrow to hold the glow of the air below the target lets the horizon drop out of the frame, so Jupiter through a telescope from the Earth is crisp on black instead of seen through a brown haze.
5. **A ladder of rates, not a multiplier.** At true scale 2× and 100× look exactly like real time: nothing visibly moves. The ladder climbs in the units things move in instead: real time, 1 min/s (the Moon crosses its own width in a minute), 10 min/s, 1 hr/s, 6 hr/s, 1 day/s (the Earth turns once a second), 1 wk/s, 1 mo/s (the Moon's phases once a second) and 1 yr/s (the planets wheel round). Below real time the same rungs run backward.
6. **An eclipse is a jump and a seat to watch it from.** The plus drawer lists the next solar and lunar eclipse with kind, date and time. Choosing one moves the clock to 90 minutes (solar) or two hours (lunar) before the peak, runs it at 10 min/s and seats you where it shows best: on the Moon looking at the Earth, so the shadow crosses the day side, or on the Earth looking at the Moon as it turns copper.
7. **Photographs, not paint.** Every surface is a Solar System Scope map (CC BY 4.0, credited in the plus drawer). The Earth has day, night and cloud layers; Saturn has its ring map. The Sun is its own map's fire: boiling slowly, hotter and yellower in the middle, darker and redder at the limb, granulated close up, with a rim of fire hugging the edge.
8. **The Sun lights everything.** Each body is lit from where the Sun really is. Night sides are dark and the Earth's shows its cities. Air glows at the limb, blue where the Sun is up and red where it is setting. The Moon's dust throws light straight back, so a full Moon is a flat disc; its night side catches earthshine; in the Earth's shadow it turns copper. Shadows of the Moon on the Earth and the Earth on the Moon are cast for real, umbra and penumbra. The stars are the Yale Bright Star Catalogue, about 9,100 of them to magnitude 6.5, in their own colours.
9. **The lights are out.** Lightbox and Lattice are lit white rooms. Space is black, and a white sky would be a lie the photographs cannot survive. So Solar is the same room from the dark side: the same smoked-glass chrome, radii, timings, type and fibre, with white ink at the strengths the light rooms use for dark. The family is in the objects, not the background.
10. **The Moon is the only moon.** Each giant's moons are a project of their own. The Earth's is the one everyone knows and the one eclipses need.
11. **The chrome is copied a third time.** Lattice said a shared package becomes worth it when a third instrument appears. Solar is that instrument and still copies, because its chrome is the dark-side version of the same components: sharing first needs the tokens split from the components, which is a change to all three, not part of building one. The title is already shared. Pulling dock, drawer, tray and legend into `src/chrome/` is the first job after v1.

## 3. The sky

**Bodies.** IAU equatorial radii with true flattening, so Jupiter and Saturn are visibly squat. Each is a ray traced against an ellipsoid per pixel, in the body's own frame: no meshes, so a limb stays round at any zoom. Too small for a pixel, a body becomes a point in its own colour, dimmed by how little of its day side faces you.

**Precision.** Everything is km in double precision on the CPU. The GPU only ever sees positions taken from the eye, so the Moon from a few km and Neptune from four billion are both drawn without jitter.

**Orbits.** One lap of each planet's path as a hairline, and the Moon's round the Earth, redrawn as the Sun pulls it about. Through a narrow lens paths are clutter, so only the one through what you are looking at stays, faintly.

**Names.** Small caps beside each body too small to read on its own, hidden behind nearer bodies. A name is as clickable as its body.

**The Sun's light.** A soft halo when you are far off, a rim of fire at the limb when close, dithered so it never bands. When something covers the Sun, its glare goes and the corona shows.

## 4. Interaction

| You want to | Do this |
| --- | --- |
| Look at a body | Click it or its name |
| Become a body | Double-click it, its number key (<kbd>1</kbd> Sun to <kbd>0</kbd> Neptune, Sun outward, the Moon after the Earth), or the seat chip. You keep looking at what you were looking at |
| Look around | Drag. Sideways walks you round the line to the target; up and down moves the horizon |
| Zoom | Scroll |
| See the body you are on | <kbd>Esc</kbd>, or click it. A globe, dragged round |
| Stop time | <kbd>Space</kbd> |
| Faster, slower, backward | <kbd>.</kbd> and <kbd>,</kbd>, or the arrows round the rate in the dock |
| Back to now | <kbd>N</kbd>, or Back to now in the plus drawer |
| Watch the next eclipse | The plus drawer |
| Go to Lightbox or Lattice | Its name, top left |

## 5. Chrome

**Title, top left.** All three names, white here: the shared title takes its two shades from properties.

**Dock, bottom centre.** Left to right: the seat chip (its sphere and name, opening the bodies drawer), play or pause, the date and time in UTC, the rate between a slower and a faster arrow, and the plus. Fades when idle and playing, as in the other two.

**Drawers.** Bodies: the ten, Sun outward, each with its sphere, name, kind and number key. Plus: the next solar and the next lunar eclipse, Back to now, and the credit line.

**Readout, top right.** The target and where it is seen from, then `DISTANCE`, `LIGHT` (how long its light takes to arrive), `SIZE` (across, in the sky) and `LIT` (how much of the disc you see is in daylight). On a globe: `ABOVE`, `SUN`, `SUNLIGHT` and `RADIUS`.

**Legend, bottom left.** `DRAG look around`, `SCROLL zoom`, `CLICK look at it`, `DOUBLE-CLICK go there`.

**Under 620 px.** Legend hidden, readout at a 10 px inset, the chip shows its sphere only and the clock stacks the date over the time.

## 6. What's NOT in v1

- **Standing on the surface.** A blue sky by day, ground underfoot, the Sun rising through the air. v1 sits just above each body, outside its air, which is why every sky is black. First v2 candidate.
- **Other moons.** The Galilean moons and Titan first.
- **Dwarf planets, asteroids, comets, spacecraft.**
- **Light time in the picture.** Bodies are drawn where they are, not where their light left them. The readout gives the delay.
- **An address.** A URL carrying the moment, the seat and the target.
- **Pinch to zoom** on a phone, and **sound**.

## 7. Architecture

Same split as the other two: everything that moves lives outside React, which draws the chrome from a small snapshot. The clock and the names in the sky are written into the page every frame.

```
solar/src/sky/     bodies (sizes, air, rings), ephemeris (Astronomy Engine to ecliptic km), eclipses, stars
solar/src/render/  camera (seat and globe eyes), gl (ellipsoids, rings, air, the Sun's light, stars, orbits), maps
solar/src/app/     instrument (clock, seat and look, flights, pointer, frame loop, snapshot), time (rates, labels)
solar/src/ui/      Dock, Bodies, Options, Readout, Legend, Sphere, Icons
solar/src/styles/  global (the dark tokens), stage, ui
```

All ten positions are worked out every frame. Eclipse searches take a few ms, so they run at most twice a second. The maps are 6 MB and load after the first frame; until its map arrives a body shows its own colour.

## 8. Acceptance

As unit tests:

- The Earth is 0.9833 AU from the Sun at perihelion and 1.0166 at aphelion; the Moon stays between 356,000 and 407,000 km.
- The Earth's axis tilts 23.44°. At noon UTC on the March equinox the Sun is over Greenwich, and at the June solstice over the Tropic of Cancer. The Moon keeps one face to the Earth, within its libration.
- Solar eclipses from 2024-04-08 (total) to 2027-08-02 (total), and lunar ones from 2025-03-14 (total) to 2027-02-20 (penumbral), come back in order and of the right kind; the 2024 one peaks over Mexico.
- The rate ladder only climbs and runs back symmetrically. Labels read in UTC, and light time carries into the next unit rather than reading 60.
- Disc overlap is exact for none, total, annular and partial cover.
- The horizon lands where asked for a far target and for Mercury seen from the Sun through a 0.04° lens. With air, a narrow lens keeps the glow below the target.

By eye:

- The Moon from the Earth shows the phase a calendar gives for that day.
- Watching the next solar eclipse from the Moon, the shadow crosses the Earth where the eclipse maps say it will.
- 60 fps on a 2020 MacBook Air at 1440×900, on a globe and looking across the system.

## 9. Running it

From the repo root: `npm run dev` and open `/solar/`. Tests, lint, typecheck and the build cover all three instruments, and Pages deploys them from `main`.
