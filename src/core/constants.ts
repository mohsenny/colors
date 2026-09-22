/**
 * Tuned constants.
 *
 * These are a coupled set: the overlap statistics, the palette constraints and
 * the density band were calibrated together. If the slides overlap too much or
 * too little, change SIZE_FRAC_ONE or SLIDE_COUNT, not the steering gains.
 */

/** Fixed simulation timestep. Peak speed is well under half a pixel per frame. */
export const DT = 1 / 60
/** A stalled tab must not spiral; drop simulation time instead. */
export const MAX_SUBSTEPS = 4

/** Rolling history: 15 seconds at 60 Hz. */
export const HISTORY_FRAMES = 900
/** Floats per frame. 8 globals + 9 slides x 31 lanes, rounded up. */
export const SLIDE_LANES = 32
export const GLOBAL_LANES = 8

/** Slides, by viewport. Small screens carry fewer so the composition can breathe. */
export const SLIDE_COUNT = 9
export const SLIDE_COUNT_SMALL = 4
export const SMALL_VIEWPORT = 620

// --- slide anatomy, all in CSS px and never scaled by depth -----------------
export const FRAME_PX = 7
export const FRAME_PX_SMALL = 5
export const CORNER_OUTER = 3
export const CORNER_INNER = 1.5
export const TAB_W = 56
export const TAB_H = 18
/** How far the tab stands proud of the top frame edge. */
export const TAB_PROUD = 14
export const TAB_RADIUS = 3
/**
 * Every tab sits in the same corner: hard left on the top edge, flush with the
 * inside of the mount. The staggered ladder this replaces did keep two crossing
 * slides from hiding each other's hex, but six tabs at six different offsets
 * read as an accident rather than as a system, and a set of identical objects
 * has to be identical. The cost is real and is paid for elsewhere: clicking a
 * slide lifts it to the top of the pile and stops it, so an obscured hex is one
 * click from being readable.
 */
export const TAB_INSET = 0

/** Legal size range as a fraction of `min(vw, vh)`, enforced during resize. */
export const SIZE_FRAC_MIN = 0.12
export const SIZE_FRAC_MAX = 0.62
/** Absolute pixel clamps so a slide is never unreadable or wall-to-wall. */
export const SIZE_PX_MIN = 120
export const SIZE_PX_MAX = 560

/**
 * One size for every slide, as a fraction of `min(vw, vh)`, and one aspect.
 * The size ladder this replaces carried the visual hierarchy, and losing it
 * costs something: the set is flatter, and depth now has to come entirely from
 * shadow, speed and paint order. It buys two things. A set of identical mounts
 * reads as one instrument rather than as six unrelated objects, and equal areas
 * mean equal dye density, which is most of why one slide used to dictate the
 * colour of every overlap it touched.
 *
 * The number is chosen to hold total painted area roughly constant as the
 * slide count changes, because that is what the overlap statistics were tuned
 * against: nine at 0.27 squared is very close to seven at 0.30 squared, which
 * was very close to the old six-rung ladder.
 */
export const SIZE_FRAC_ONE = 0.27
/**
 * Width over height. Square, and `dimensions` keeps AREA fixed rather than
 * width, so changing this changes the shape of a slide and not how much of the
 * stage it covers.
 *
 * SLIDE_ASPECT_SPREAD is the deviation each slide draws once at seed time and
 * then keeps. Nine exact squares read as a tiling; nine squares that are each a
 * few percent off read as nine cut sheets, and 5% is small enough that no
 * single slide looks like a mistake.
 */
export const SLIDE_ASPECT = 1
export const SLIDE_ASPECT_SPREAD = 0.05

// --- motion -----------------------------------------------------------------
/**
 * Base speed in u/s, so 0.06 crosses one viewport height in 17 seconds. The
 * band is deliberately wide: seven slides at similar speeds read as a set being
 * moved by one hand, and the difference between the slowest and the fastest is
 * most of what sells them as seven independent objects.
 *
 * Doubled twice now. The first pass was tuned for hypnotic and landed on inert.
 */
export const SPEED_MIN = 0.032
export const SPEED_MAX = 0.088
/** Sum of steering terms is clamped here, in degrees per second. */
export const STEER_CLAMP_DEG = 4.2
export const WANDER_GAIN_DEG = 1.8
/**
 * Each slide is leashed to its own slowly drifting home, not to a shared centre.
 * One attractor plus a circular leash kept the whole set inside a single disc and
 * left the rim of the rectangle permanently empty, which reads as a clump in a
 * large blank room rather than a composition.
 */
export const HOME_GAIN_DEG = 1.2
/** Home ring radius, as a fraction of the half-playground on each axis. Each
    slide takes its own share of this, 0.55x to 1.4x, so no two orbits match. */
export const HOME_RING = 0.62
/** How far a slide's orbit centre sits off the middle of the box, in u. */
export const HOME_OFFSET = 0.1
/** Base radians per second. Per-slide rates run 0.45x to 2.05x this, and odd
    slides run backwards, so a lap takes anywhere from four to twenty minutes. */
export const HOME_DRIFT = 0.011
/** How far from home a slide may wander before the leash starts to pull. */
export const HOME_SLACK = [0.42, 1.0] as const
/** Radians the leash leads its target by, so the approach spirals in. */
export const HOME_LEAD = 0.55
export const CROWD_TRIGGER = 1.25
export const CROWD_GAIN_DEG = 1.6
export const CROWD_GAIN_HARD_DEG = 2.4
export const LONELY_AFTER_S = 6
export const LONELY_GAIN_DEG = 0.9
/**
 * Two slides that overlap have nothing pushing them apart: the crowd term needs
 * an occupancy a single pair can never reach, so a pair could ride along
 * together for a measured mean of 14 seconds and a worst case of 34. That is
 * precisely what reads as "they move as a clump" rather than as six objects
 * that happen to cross. This is the pair's own clock. After STICKY_AFTER_S of
 * unbroken contact the slide starts steering off its neighbour's bearing,
 * ramping in over STICKY_RAMP_S so nothing visibly flinches, and the timer
 * unwinds at twice that rate once they part.
 *
 * It shortens overlaps without making them rarer, which is the whole point: the
 * brief asks for two and three slides overlapping most of the time, and says
 * nothing about one pairing lasting half a minute.
 */
export const STICKY_TRIGGER = 0.1
export const STICKY_AFTER_S = 2.5
export const STICKY_RAMP_S = 2.5
export const STICKY_GAIN_DEG = 2.8
export const STICKY_DECAY = 2
export const DEPTH_EASE_TAU = 2.2
/**
 * Tilt. Two switches, and they do different jobs.
 *
 * TILT_DEG is the resting lean: a seeded angle drawn once and then held for
 * the life of the slide. At 5 degrees the set still reads as upright and
 * filed, every overlap is still near enough a rectangle to read a colour
 * sample off, and the small disagreement between mounts is what keeps it from
 * looking printed. Set it to 0 for a perfect grid, or back to 14 for the
 * scattered look.
 *
 * SPIN is the other thing tilt used to mean: slides that also turn, forever,
 * slowly, with the bounce feeding their angular velocity. Off, because a lean
 * that drifts is no longer a lean, it is clutter. The rotation path in the
 * simulation stays intact rather than being deleted and the ON values below
 * are the tuned ones, so bringing it back is one edit.
 */
export const TILT_DEG = 5
export const SPIN = false
/** Beyond this the slide is gently torqued back; it is a spring, not a wall. */
export const ROT_RESTORE_DEG = 22
export const OMEGA_MAX_DEG = SPIN ? 2 : 0
export const OMEGA_MIN_DEG = SPIN ? 0.22 : 0

// --- bounce -----------------------------------------------------------------
export const BOUNCE_COOLDOWN = 0.25
export const BOUNCE_ANGLE_JITTER_DEG = 14
export const BOUNCE_SPEED_JITTER = [0.88, 1.12] as const
/** Keeps a slide from ping-ponging on one axis or skating along an edge. */
export const AXIS_LOCK_MIN_DEG = 12
export const AXIS_LOCK_MAX_DEG = 82
/**
 * Steering has to refuse an axis just as a bounce does. The bounce guard alone
 * left a slide that had been slowly *steered* onto a horizontal heading sitting
 * there, because nothing pushed it off: one seed in three spent 12% of its life
 * on an axis, which reads as a machine rather than a drifting object.
 */
export const AXIS_ESCAPE_DEG = 14
export const AXIS_ESCAPE_GAIN_DEG = 1.6
export const SOFT_CATCH_CHANCE = 0.06
export const SOFT_CATCH_FACTOR = 0.45
export const SOFT_CATCH_RECOVER = 0.9

// --- depth -> shadow contract -----------------------------------------------
/** Notional height above the surface, in "millimetres", from `z`. */
export const H_MM_BASE = 1.6
export const H_MM_RANGE = 5.2

// --- colour ------------------------------------------------------------------
// Measured, not guessed. Below about 0.7 the film model washes every dye out to
// near-white on a white lightbox, which is the "six pastels" failure the brief
// rules out. Above 0.95 the four-way stack goes to mud.
export const DENSITY_MIN = 0.75
export const DENSITY_MAX = 0.95
/** Colour-only crossfade on regenerate. Motion is untouched. */
export const TWEEN_MS = 520
export const TWEEN_STAGGER_MS = 46
/** Mode A <-> Mode B crossfade. */
export const MODE_MS = 420

// --- autonomous colour drift --------------------------------------------------
/**
 * Every slide wanders slowly around the colour the palette gave it: a hold, a
 * long dissolve, another hold. Nothing blinks and nothing jumps.
 *
 * It is a wander around a base, not a re-roll. A slide that picked its own new
 * colour every eight seconds would throw away the thing the palette generator
 * exists for, which is the relationship between the seven of them. Bounded
 * excursions keep that relationship and still mean the overlaps are never the
 * same twice: the crossings move much further than the slides do, because two
 * drifting hues compound.
 *
 * The clock is `state.t` and the waypoints are hashes, so this is a pure
 * function of simulation time. Scrubbing reproduces it exactly, and a pause
 * stops it dead with everything else.
 */
export const DRIFT_HOLD_S = 5.2
export const DRIFT_TRANS_S = 3.1
/** Per-slide spread on the two above, so no two slides share a cadence. */
export const DRIFT_HOLD_SPREAD = [0.78, 1.5] as const
export const DRIFT_TRANS_SPREAD = [0.85, 1.35] as const
/** Excursion at full amplitude. Hue dominates; the rest is seasoning. */
export const DRIFT_HUE_DEG = 26
export const DRIFT_CHROMA = 0.18
export const DRIFT_L = 0.045
export const DRIFT_DENSITY = 0.05
/** Per-slide amplitude scale. Some slides travel, some barely stir. */
export const DRIFT_AMP = [0.34, 1] as const
/** Seconds for drift to fade back in after an unpin. Locked slides hold still. */
export const DRIFT_GATE_S = 2.4
/**
 * The separation the drift has to leave between two slides. The palette
 * generator works hard to keep the hues apart, and two neighbours each swinging
 * DRIFT_HUE_DEG would walk straight through that work and meet in the middle: a
 * pair 40 degrees apart would arrive at the same colour about four seconds
 * later. So a slide's hue excursion is half its distance to its nearest
 * neighbour less this, which makes the guarantee absolute rather than
 * proportional: however the palette landed, no two slides ever come closer than
 * this, and a well separated slide gets MORE room, not less.
 *
 * It is 16 and not 20 because of the slide count. Nine hues share the wheel, so
 * the typical neighbour is 30 degrees away rather than 45, and a 20 degree
 * keep-out left 5 degrees of swing: technically alive, visually switched off.
 * Sixteen degrees of backlit gel still reads as two colours, and only at the
 * instant both neighbours happen to be at opposite extremes.
 */
export const DRIFT_KEEP_DEG = 16
/** A slide with no room left still breathes, or it reads as switched off. */
export const DRIFT_MIN_DEG = 5

// --- the lamps ----------------------------------------------------------------
/**
 * Four tubes behind the diffuser, each with its own colour temperature, each
 * drifting. Two periods per tube, deliberately not harmonics, so the four never
 * line up twice: one warms while another cools and the pattern never repeats
 * inside a sitting. An order of magnitude slower than the slide colours, which
 * is the point. You should notice the room has changed, not watch it change.
 */
export const TUBE_COUNT = 4
export const TUBE_SLOW_S = 104
export const TUBE_FAST_S = 47
/**
 * Warm and cool ends of the drift, as sRGB byte triples. Both ends peak at 255
 * and `lampsAt` renormalises everything between them to do the same, because a
 * straight interpolation between two tints passes through a dull grey at the
 * midpoint: the first version spent most of its time near (246, 247, 244) and
 * the whole box looked switched off. A lamp is always at full brightness. What
 * changes is its colour.
 */
export const TUBE_WARM = [255, 246, 226] as const
export const TUBE_COOL = [231, 243, 255] as const
/** Brightness wobble, a fraction of full. Under 8% or it reads as a flicker. */
export const TUBE_GAIN = 0.075

// --- reduced motion -----------------------------------------------------------
/** Global speed multiplier when the user asked for less movement. */
export const REDUCED_SPEED = 0.16
export const REDUCED_OMEGA = 0.12
