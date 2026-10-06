# Solar

**Status:** v1, built.
**Trigger:** Mohsen's idea for a third instrument beside Lattice: our solar system, with the planets where they really are, at their real sizes and distances, and a clock that runs fast or backward. True scale is mostly empty space, so rather than flying through it you become a body and look at the others from there. Jump to the next eclipse and watch it happen.
**Owner:** Mohsen.
**Siblings:** Lightbox at the root, Lattice under `lattice/`, Solar under `solar/`. Same hand, same chrome, with the lights out.

---

## 1. What it is

The Sun, the eight planets and Pluto, the Moon, nine moons of Jupiter, thirteen of Saturn, five of Uranus, Neptune's Triton and Pluto's Charon where they are right now, at their true sizes and distances. The planets, the Moon, the giants' round moons, Pluto and Charon wear a photographed map of their surface but Titan, which is all haze; the small moons wear their colour. It opens on the Earth looking at the Moon, at real speed.

You are always on a body, the seat. Looking at another body, you sit just above the seat with its horizon low in the frame and the other body in the middle, the way that planet's own sky would show it. Look at the seat itself and you circle it as a globe. Double-click anything to become it, and the eye flies there and shows you its globe.

Speed the clock up and the sky starts to move: the Moon's phases, the Earth turning its cities into the night, Venus swinging from evening to morning, Mars looping backward, Jupiter's moons dropping their shadows on it. Every frame is the real geometry for that moment.

## 2. Decisions already made

1. **Real positions from a real ephemeris.** Astronomy Engine: VSOP87 for the planets, its own integration for Pluto, ELP for the Moon, L1.2 for Jupiter's big moons, the IAU's rotational elements for which way each body is turned, within an arcminute of JPL Horizons. It is the one runtime dependency besides React anywhere on the site, and Solar's alone. A planetary theory written by hand is weeks of work and a quiet source of wrong answers, and the eclipse searches come with it. MIT, no dependencies of its own. It has no moons of Saturn, so those are Meeus's (chapter 46), written out in `sky/saturn.ts`. From 1930 to 2110 Jupiter's big moons are within 700 km of Horizons, Saturn's inner five within 2,000, Titan 3,000 and Iapetus, far out, a third of a degree of its orbit. The small moons and Charon are ellipses on JPL's mean elements, in `sky/kepler.ts`, each placed along its orbit by a fit to Horizons, with the swings no ellipse makes added: Janus and Epimetheus trading orbits and turning round about 10,000 km apart, Hyperion rocking in step with Titan. Uranus's five round moons and Triton are ellipses there too, fitted to Horizons whole, with Miranda and Ariel swinging in step with Umbriel. Epimetheus' eccentricity is Horizons', half what the mean elements give. Himalia and Phoebe, which the Sun pulls about, are only roughly right. Astronomy Engine gives the point Pluto and Charon go round, not Pluto, so Pluto is set off it by Charon's pull. The moons keep one face to their planet, and Pluto and Charon to each other; Hyperion really tumbles and Himalia and Phoebe spin in hours, which a plain colour does not show. The clock runs from the year 1000 to 3000, but the moons were checked only from 1610 to 2190 (Jupiter's big four) and 1761 to 2240 (Saturn's round ones), within half a degree round the orbit and Iapetus 1.4° by 2240, and the small ones over the years Horizons has them, as few as 1950 to 2050 for Saturn's inner four, and Uranus's and Triton from 1950 to 2100, within 3,000 km. Outside that they are drawn, not vouched for. Pluto drifts from Horizons away from 2000, to 3.7 million km by 1000 and 3000: under three minutes of arc from the Sun.
2. **True scale, made navigable by becoming a body.** Put the Sun on a screen at true scale and Neptune is a speck a kilometre away; no zoom shows both. So you never fly a camera through the gaps. You sit on a body and look out, and distance stops being a navigation problem and becomes what you see: Jupiter from the Earth is a 34″ disc that needs a telescope lens, the Earth from Mars a bright star with the Moon beside it.
3. **One zoom axis: a telescope one way, backing away the other.** Scrolling in narrows the lens to a twentieth of a degree, about a good amateur telescope; a new scroll past that goes on into the body, onto its globe on the side it was seen from, as large as it looked, or whole if it looked smaller. Scrolling out widens it to 46°, then backs away from the seat as far as 100 AU, where Neptune's whole orbit fits with room round it, whatever you sit on. Looking at a body sets the lens so it is an eighth of the frame across, or for the four giants and Pluto wide enough for the moons that go round within three weeks to fit as well.
4. **The horizon is placed, not stumbled on.** The seat's horizon rests 0.56 of the half height below the target, worked out exactly even when the target is only a few dozen radii away, as Mercury is from the Sun. Dragging the ground up or down tilts you the way you drag, as on the sky, the horizon going from a tenth of the half height below the target, where the Earth seen from the Moon is rising over it, to just above the bottom edge. Where the seat has air, a lens too narrow to hold the glow of the air below the target lets the horizon drop out of the frame, so Jupiter through a telescope from the Earth is crisp on black instead of seen through a brown haze.
5. **Dragging the sky turns you round on the spot; dragging the ground goes round the seat.** The eye swings round the seat, which stays under you and level. Across, you turn the way you drag: on the Moon with the Earth ahead, a drag across the screen brings the Sun behind you into view. Up and down you look the way you drag, as a camera tilts. Through a telescope the sky moves at most ten times as fast as the hand, so it can still be aimed. Clicking the target again brings it back to the middle. You start over the seat's north, so the ground in front of you would always be its northern half: dragging the ground across goes round to any other side, the target staying in the middle and the sky turning about it. Looking at something else starts over the north again.
6. **A speed knob in the units things move in.** At true scale 2× and 100× look exactly like real time: nothing visibly moves. So the knob rests on real time in the middle and, turned either way, starts at 1 min/s (the Moon crosses its own width in a minute) and climbs evenly through 1 hr/s, 1 day/s (the Earth turns once a second) and 1 mo/s (the Moon's phases once a second) to 1 yr/s (the planets wheel round) at the end. Right runs the clock forward, left backward. Its only words are the speed it is at, signed and in two figures: +2.5 hr/s, −1 day/s. The arrow keys, <kbd>.</kbd> and <kbd>,</kbd> stop at the round speeds: 1 and 10 min, 1 and 6 hr, 1 day, 1 wk, 1 mo and 1 yr a second.
7. **The tape: the last two minutes as you watched them.** A moment that has gone by can be found again. The clock is sampled thirty times a second of playing whatever the rate, so an eclipse watched slowly takes as much tape as a year that flew by. Pausing or grabbing it opens it out, as in Lattice; playing on from a moment drops what came after. A jump, back to now or to an eclipse, stays a jump, and the eclipse peaks it ran through are marks a drag snaps to: the Sun in gold for a solar eclipse and a copper crescent Moon for a lunar one, the icons of the drawer's two rows. Pointing at a mark names its eclipse.
8. **An eclipse is a jump and a seat to watch it from.** The plus drawer has a row for solar eclipses and one for lunar, each showing, with kind, date and time, the one the clock is at (lit, within three hours of its peak) or else the next. A step back and a step on either side walk through them to the first and last in the clock's range, and the drawer stays open so the steps can follow one another. Choosing or stepping to one moves the clock to 90 minutes (solar) or two hours (lunar) before the peak, runs it at 10 min/s and seats you where it shows best: on the Moon looking at the Earth, so the shadow crosses the day side, or on the Earth looking at the Moon as it turns copper.
9. **Photographs, not paint.** The planets and the Moon wear Solar System Scope maps (CC BY 4.0, credited in the README), the round moons of the four giants the Voyager, Galileo and Cassini mosaics of NASA, JPL and the USGS. Titan has none: its haze hides the ground, so it is a ball of orange haze. Pluto and Charon wear the New Horizons mosaics of NASA, JHUAPL and SwRI. It flew by with their south in its long winter night, so below about 30° S the map is filled smoothly from the colours round it, as Uranus's moons and Triton are north of their equators, which Voyager 2 saw little of. Pluto's mosaic is redder than the eye would see, so it is graded to New Horizons' true-colour picture: tan and peach, the dark Cthulhu belt and the pale heart of Tombaugh Regio on the side away from Charon. Triton's is graded from Voyager's green to its pinkish white. The small moons have no map yet and wear their own colour. The Earth has day, night and cloud layers; Saturn has its ring map. The Sun is its own map's fire: boiling slowly, hotter and yellower in the middle, darker and redder at the limb, granulated close up, with a rim of fire hugging the edge.
10. **The Sun lights everything.** Each body is lit from where the Sun really is. Night sides are dark and the Earth's shows its cities. Air glows at the limb, blue where the Sun is up and red where it is setting. The Moon's dust throws light straight back, so a full Moon is a flat disc, and the other moons and Pluto are lit the same way. A moon's night side catches its planet's light: earthshine on the Moon, a warmer glow from Jupiter, Saturn and Pluto, a bluer one from Uranus and Neptune. A planet and its moons shadow each other for real, umbra and penumbra: the Moon on the Earth, the Earth on the Moon, the black dots of Jupiter's moons on Jupiter. Only the Moon turns copper in shadow, lit through the Earth's air. The stars are the Yale Bright Star Catalogue, about 9,100 of them to magnitude 6.5, in their own colours. Brightness is real too: a point is as bright as its magnitude among the stars, and anything bright in view hides the faint stars round it.
11. **The lights are out.** Lightbox and Lattice are lit white rooms. Space is black, and a white sky would be a lie the photographs cannot survive. So Solar is the same room from the dark side: the same smoked-glass chrome, radii, timings, type and fibre, with white ink at the strengths the light rooms use for dark. The family is in the objects, not the background.
12. **The giants' round moons, the small ones worth a look, and Pluto with Charon.** Jupiter's four and Saturn's seven round ones are big enough to show as discs from nearby and to drop shadows you can see on their planet. With them are the small ones with something to see: Jupiter's four inner moons, red Amalthea among them, and Himalia, the biggest of its far ones; Saturn's ring shepherds Prometheus and Pandora, Janus and Epimetheus, which swap orbits every four years, Hyperion, and dark Phoebe going round backward. Uranus's five round ones go round it on its side, and Neptune's Triton, as big as Pluto, goes round backward. Smaller ones still would be names without sights. Pluto is the one dwarf planet, with Charon, half its size: the two go round a point in the space between them. Pluto has its path drawn like a planet's and the last number key; it comes after Neptune in the bodies drawer, and each moon under its planet. A moon a few pixels from its planet folds into the planet's point, name and all, so Jupiter from the Earth is one bright dot until you zoom in.
13. **The chrome is copied a third time.** Lattice said a shared package becomes worth it when a third instrument appears. Solar is that instrument and still copies, because its chrome is the dark-side version of the same components: sharing first needs the tokens split from the components, which is a change to all three, not part of building one. The title, idle and save are already shared. Pulling dock, drawer, tray and legend into `src/chrome/` is the first job after v1.

## 3. The sky

**Bodies.** IAU equatorial radii with true flattening, so Jupiter and Saturn are visibly squat. The small moons are lumpy, but each is drawn as a ball of its mean radius. Each is a ray traced against an ellipsoid per pixel, in the body's own frame: no meshes, so a limb stays round at any zoom. The lens is stereographic, the projection that keeps circles circles, so a body at the edge of a wide frame is as round as one in the middle. Too small for a pixel, a body becomes a point as bright as its magnitude: its size and albedo, its distances from the Sun and from you, and how much of its day side faces you, with Saturn's rings and a moon in its planet's shadow. The one you are looking at never fades below the faintest star.

**Precision.** Everything is km in double precision on the CPU. The GPU only ever sees positions taken from the eye, so the Moon from a few km and Neptune from four billion are both drawn without jitter.

**Orbits.** One lap of each planet's path, and Pluto's, as a hairline, and each moon's round its planet once that is big enough on screen to read, redrawn as it is pulled about. Through a narrow lens paths are clutter, so only the one through what you are looking at stays, faintly.

**Names.** Small caps beside each body too small to read on its own, hidden behind nearer bodies. Where two would run into each other, the one you are looking at keeps its name, then the bigger body. A moon beside its planet drops its name rather than print it across the planet. A name is as clickable as its body.

**The Sun's light.** A soft halo when you are far off, a rim of fire at the limb when close, dithered so it never bands. When something covers the Sun, its glare goes and the corona shows.

**Light.** The Sun gives 128,000 lux at the Earth's distance and a square less farther out: 50 to 150 at Pluto, as it nears and leaves the Sun. The eye adapts to what it looks at, so a lit disc is never darkened. Points and stars share the magnitude scale and show to what the eye makes out against the sky behind them (Schaefer), a lens adding up to a 20 cm telescope's reach. Whatever is bright on screen scatters light in the eye over the sky round it (Stiles and Holladay), so stars go near the Moon, beside a sunlit globe and round the Sun from anywhere, and the Sun's halo keeps its size in the eye however far off it is.

## 4. Interaction

| You want to | Do this |
| --- | --- |
| Look at a body | Click it or its name |
| Become a body | Double-click it, its key (<kbd>S</kbd> the Sun, then <kbd>1</kbd> Mercury to <kbd>0</kbd> Pluto, the Moon after the Earth), or the seat chip, where the moons sit under their planet. You arrive over its globe, the whole of it in the frame; picking it again brings that back |
| Look around | Drag the sky. It turns round you; click the target to bring it back to the middle |
| Go round the body you are on | Drag its ground. Across goes round it, the target staying put; up and down moves the horizon |
| Zoom | Scroll. A globe zooms toward the pointer; scrolling in over the ground you sit on turns to that side of its globe, and a new scroll past the narrowest lens goes into the body under the pointer, or the one you look at |
| See the body you are on | <kbd>Esc</kbd>, or click it. A globe, dragged round |
| Stop time | <kbd>Space</kbd> |
| Faster, slower, backward | Turn the knob in the dock, or <kbd>.</kbd> and <kbd>,</kbd>. Double-click it for real time |
| Find a moment again | Pause, or drag the tape in the dock |
| Back to now | <kbd>N</kbd>, or Now in the dock |
| Watch an eclipse | The plus drawer: the next, or step back and on through them |
| Go to Lightbox or Lattice | Its name, top left |

## 5. Chrome

**Title, top left.** All three names, white here: the shared title takes its two shades from properties.

**Dock, bottom centre.** Left to right, in four groups set apart by a wider gap: the seat chip (its sphere and name, opening the bodies drawer); the date and time in UTC, and Now; play or pause, the tape, and the speed knob with its speed; save and the plus. Now's dot is red while the clock plays the present at real time, as on a live stream; once it has left, the dot is a ring and Now takes it back. Paused, the tape opens out to the right while the rest stays put.

**Drawers.** Bodies: the ten and Pluto, Sun outward, each with its sphere, name, kind and key, and the moons of Jupiter, Saturn, Uranus, Neptune and Pluto by name under their planet, nearest first. It stops below the title, and under 620 px below the readout too, and scrolls past that. Plus: the solar and the lunar eclipses, each by its icon and between a step back and a step on.

**Readout, top right.** The target and where it is seen from, then `DISTANCE`, `LIGHT` (how long its light takes to arrive), `SIZE` (across, in the sky) and `LIT` (how much of the disc you see is in daylight). On a globe: `ABOVE`, `SUN`, `SUNLIGHT`, `NOON` (the light there at noon, in lux) and `RADIUS`.

**Legend, bottom left.** `DRAG THE SKY look around`, `DRAG THE GROUND go round it`, `SCROLL zoom`, `CLICK look at it`, `DOUBLE-CLICK go there`. Hidden under 1,197 px, where the dock would come within 15 px of it.

**Idle.** As in the other two: three seconds without the mouse, a touch or a key, or the window left for another, and every word and control goes, playing or paused. Here the names in the sky go with them, and the paths fade out with the chrome and back in as quickly as it returns. An open drawer, a press still down (the knob held still), the mouse resting on the chrome, or focus tabbed into it holds them. A touch on an idle page only brings them back: the tap that wakes it presses nothing.

**Save.** The sky as idle leaves it, without the names or the paths, as a plain download (`Solar 2026-10-06 at 12.59.07.png`).

**Under 760 px.** Now shows its dot only and the clock drops UTC, so the tape has room to open.

**Under 620 px.** Readout at a 10 px inset, the chip shows its sphere only, the clock stacks the date over the time and the tape is short until it opens. Under 395 px the dock's spacing closes up and the tape gives way while playing, never under 20 px.

## 6. What's NOT in v1

- **Standing on the surface.** A blue sky by day, ground underfoot, the Sun rising through the air. v1 sits just above each body, outside its air, which is why every sky is black. First v2 candidate.
- **More moons.** Phobos and Deimos next, then Pluto's four small ones, then Neptune's Proteus and Nereid.
- **Maps for the small moons.**
- **Other dwarf planets, asteroids, comets, spacecraft.**
- **Light time in the picture.** Bodies are drawn where they are, not where their light left them. The readout gives the delay.
- **An address.** A URL carrying the moment, the seat and the target.
- **Pinch to zoom** on a phone, and **sound**.

## 7. Architecture

Same split as the other two: everything that moves lives outside React, which draws the chrome from a small snapshot. The clock and the names in the sky are written into the page every frame.

```
solar/src/sky/     bodies (sizes, air, rings), ephemeris (Astronomy Engine to ecliptic km), saturn (its round moons), kepler (the small moons and Charon on JPL's ellipses, Uranus's and Triton on ellipses fitted to Horizons), eclipses, stars, light (magnitudes, what the eye makes out, glare)
solar/src/render/  camera (seat and globe eyes), gl (ellipsoids, rings, air, the Sun's light, stars, orbits), maps
solar/src/app/     instrument (clock, seat and look, flights, pointer, frame loop, snapshot), tape, time (the knob's speeds, labels)
solar/src/ui/      Dock, Timeline, Knob, Bodies, Options, Readout, Legend, Sphere, Icons
solar/src/styles/  global (the dark tokens), stage, ui
```

All 40 positions are worked out every frame. Eclipse searches take a few ms, so they run at most twice a second; the first and last of each kind in the clock's range are found once. The maps of the planets and the Moon are 6 MB and load after the first frame; the giants' round moons, Pluto and Charon have 6 MB more, each fetched when it first comes near enough to show. Until its map arrives a body shows its own colour, and the small moons stay so.

## 8. Acceptance

As unit tests:

- The Earth is 0.9833 AU from the Sun at perihelion and 1.0166 at aphelion; the Moon stays between 356,000 and 407,000 km.
- The Earth's axis tilts 23.44°. At noon UTC on the March equinox the Sun is over Greenwich, and at the June solstice over the Tropic of Cancer. The Moon keeps one face to the Earth, within its libration.
- Jupiter's and Saturn's round moons are where JPL Horizons has them in 2020 and 2026: within 1,000 km for Jupiter's, 2,500 for Saturn's inner five, 4,000 for Titan and 10,000 for Iapetus. The small ones are near where it has them in 2000, 2026 and 2100 (Saturn's inner four in 2000 and 2026, the years Horizons has), each within half as much again as its worst miss: Adrastea 150 km, Metis 250, Amalthea 3,000, Janus 4,500, Epimetheus 6,000, Thebe 7,500, Prometheus 25,000, Pandora 40,000, Hyperion 150,000, Phoebe 550,000 and Himalia 2 million. Janus and Epimetheus come no nearer each other than 9,000 km as they trade, where Horizons has 10,225 to 10,654. All but Iapetus, Himalia and Phoebe stay within 2° of their planet's equator, and each keeps one face to its planet and leads with 90°W, within 2°, or 10° on the less round orbits of Himalia, Hyperion and Phoebe.
- Uranus's round moons and Triton are where Horizons has them in 2000, 2026 and 2100, each within half as much again as its worst miss: Miranda 400 km, Umbriel 600, Triton 850, Ariel 1,100, Oberon 2,000 and Titania 3,500. Uranus's stay over its equator, Miranda within its 4.4°, and Triton 23° off Neptune's. Each keeps one face to its planet with the IAU's north up, so the south their maps show was lit when Voyager 2 flew by.
- In 2000, 2026 and 2100 Pluto is within 15,000, 200,000 and 450,000 km of Horizons and sits off the point it and Charon go round within 10 km of where Horizons has it, and Charon is within 50 km of where Horizons has it from Pluto. From the year 1000 to 3000 Charon keeps one face to Pluto, and Pluto its prime meridian to Charon within 5°.
- Solar eclipses from 2024-04-08 (total) to 2027-08-02 (total), and lunar ones from 2025-03-14 (total) to 2027-02-20 (penumbral), come back in order and of the right kind, and the same backward, as do two partial solar eclipses a month apart in 2018; the 2024 one peaks over Mexico. A step from an eclipse goes to the one either side of it, from between two to the last or the next, and none goes past the first or last in the clock's range.
- The knob rests on real time in the middle, only climbs either side of it, runs back symmetrically and steps through the round speeds. Speeds and light time carry into the next unit rather than reading 60, and the clock reads in UTC.
- Disc overlap is exact for none, total, annular and partial cover.
- A full Moon is magnitude −12.7, and from 1990 to 2040 the planets from the Earth are within 0.15 of Astronomy Engine's magnitudes (Saturn, and Pluto with Charon, 0.3). Venus brightens again as a thin crescent. Noon a sunlit AU out is 128,000 lux. The faintest stars, 6.5, look as they did on a dark sky, and next to a full Moon only those brighter than 2 show.
- A body at the edge of a wide frame is round, and zooming a globe keeps the ground under the pointer without swinging it round a pole, going as near as it can where north up leaves the ground out of reach.
- The horizon lands where asked, from a tenth of the half height below the target to just above the bottom edge, for a far target and for Mercury seen from the Sun through a 0.04° lens. With air, a narrow lens keeps the glow below the target.
- Turning carries the sky a pixel for a pixel and keeps you under it, level, all the way round; half way round on the Moon, the Sun that was behind you is ahead. Going round the seat, from over its north to over its south, keeps the target in the middle and the horizon where it was, and turning still carries the sky a pixel for a pixel; dragged across, the ground keeps up with the hand, a hand past its reach cannot fling you round, and coming back it turns you back. Looking at something else from upside down rolls over steadily. Backing away from even the Moon fits Neptune's orbit.
- The tape finds a moment it played through, holds two minutes, keeps a jump a jump, marks an eclipse peak run through either way, and playing on from a moment drops what came after.

By eye:

- The Moon from the Earth shows the phase a calendar gives for that day.
- Jupiter through a narrow lens shows its moons, and their shadows on it, where Sky & Telescope's Jupiter's moons tool has them for that hour.
- Watching the next solar eclipse from the Moon, the shadow crosses the Earth where the eclipse maps say it will.
- 60 fps on a 2020 MacBook Air at 1440×900, on a globe and looking across the system.

## 9. Running it

From the repo root: `npm run dev` and open `/solar/`. Tests, lint, typecheck and the build cover all three instruments, and Pages deploys them from `main`.
