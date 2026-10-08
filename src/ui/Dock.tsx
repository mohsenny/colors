import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { BlendMode } from '../core/types'
import { useIdle } from './idle'
import { Options } from './Options'
import { PhotoButton } from './PhotoButton'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  playing: boolean
  blend: BlendMode
  /** Colours off the glass for the New button, most colourful first. */
  swatches: string[]
  /** Rolls this sitting. A change is what makes the New button riffle. */
  rolls: number
  /** Passed straight through to Timeline. */
  timeline: TimelineProps
  /** Passed straight through to Options. */
  slideCount: number
  warmth: number
  glass: number
  onTogglePlay(): void
  onRegenerate(): void
  onBlendChange(mode: BlendMode): void
  onSlideCountChange(count: number): void
  onWarmthChange(warmth: number): void
  onGlassChange(glass: number): void
  onPhoto(): void
}

function Icon({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      className="lb-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

function PlayIcon(): ReactElement {
  return (
    <Icon>
      <path d="M4.4 2.6 11 7l-6.6 4.4Z" />
    </Icon>
  )
}

function PauseIcon(): ReactElement {
  return (
    <Icon>
      <path d="M5.1 2.9v8.2" />
      <path d="M8.9 2.9v8.2" />
    </Icon>
  )
}

/**
 * New colours, drawn as three of the colours it is about to replace.
 *
 * It was a circular arrow, and next to a timeline a circular arrow says
 * replay. A fan of gels says colour before it says anything else, and since
 * the gels are taken off the glass the button is never a colour that is not
 * in the room. Pressing it closes the fan and deals it open again on the new
 * roll, so the button shows what it did as well as what it does.
 */
function NewColours({
  swatches,
  rolls,
  onPress,
}: {
  swatches: string[]
  rolls: number
  onPress(): void
}): ReactElement {
  return (
    <button
      type="button"
      className="lb-deal"
      aria-label="New colours"
      // Two identical keyframes taken in turn, because re-applying the same
      // animation name does not restart it. None before the first roll, so
      // the fan does not deal itself on load.
      data-riffle={rolls === 0 ? undefined : rolls % 2 === 0 ? 'a' : 'b'}
      onClick={onPress}
    >
      <span className="lb-deal-fan" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="lb-deal-gel"
            style={{ '--gel': swatches[i % Math.max(swatches.length, 1)] } as CSSProperties}
          />
        ))}
      </span>
      <span className="lb-deal-label" aria-hidden="true">
        New
      </span>
    </button>
  )
}

/**
 * The plus, and the cross it becomes. One path that rotates rather than two
 * that swap, so opening the drawer is a single continuous gesture.
 */
function PlusIcon({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      className={`lb-icon lb-plus${open ? ' is-open' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3.2v7.6M3.2 7h7.6" />
    </svg>
  )
}

export function Dock(props: DockProps): ReactElement {
  const {
    playing,
    blend,
    swatches,
    rolls,
    timeline,
    slideCount,
    warmth,
    glass,
    onTogglePlay,
    onRegenerate,
    onBlendChange,
    onSlideCountChange,
    onWarmthChange,
    onGlassChange,
    onPhoto,
  } = props
  const [optionsOpen, setOptionsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)

  // An open drawer is a change being made, so the chrome waits for it.
  useIdle(optionsOpen)

  /*
   * The drawer is a transient layer, so touching anything else puts it away.
   * Reaching past it to grab a sheet or sample a crossing means you are done
   * with it, and having to come back and press the cross is a second gesture
   * for something you already said.
   *
   * `pointerdown`, not `click`: the sheets start a drag on pointerdown, so a
   * drag that begins outside the drawer never produces a click and the drawer
   * would survive the whole gesture. Nothing is prevented or stopped here, so
   * the press still reaches the stage and the drag starts on the same frame.
   */
  useEffect(() => {
    if (!optionsOpen) return

    const away = (e: PointerEvent): void => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setOptionsOpen(false)
    }

    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      /*
       * Escape peels one layer, and while the drawer is up the drawer is the
       * top layer. App also answers Escape, by clearing the selection, and a
       * single press doing both would restart a sheet the user had deliberately
       * stopped. Capture phase on window fires before any bubble listener on
       * window whatever order they were attached in, so stopping here is
       * deterministic rather than a race with effect ordering.
       */
      e.stopPropagation()
      setOptionsOpen(false)
      // Only the keyboard path has to move focus. An outside press has already
      // moved it to whatever was pressed, but Escape would leave it parked on a
      // control inside a drawer that is now hidden from the accessibility tree.
      moreRef.current?.focus()
    }

    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape, true)
    }
  }, [optionsOpen])

  return (
    <div
      ref={rootRef}
      className={`lb-dock${
        // The dock has to know, not just the timeline: it shifts by half the
        // growth so the widening happens to the right of the play button.
        timeline.expanded ? ' is-expanded' : ''
      }`}
    >
      {/*
        First, because it is the verb the instrument exists for, and apart from
        the timeline, which is where the old circular arrow was read as replay.
        The dock pins its left edge when it widens, so this stays put too.
      */}
      <NewColours swatches={swatches} rolls={rolls} onPress={onRegenerate} />

      <button
        type="button"
        className="lb-btn"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={onTogglePlay}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <Timeline {...timeline} />

      <div className="lb-seg" role="group" aria-label="Colour mode" data-mode={blend}>
        <span className="lb-seg-indicator" aria-hidden="true" />
        {/*
          Five letters each, which is not a coincidence: the sliding indicator
          is a 50% pill, so two labels of different lengths would leave it
          sitting off the word it is meant to be under.
        */}
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'paint'}
          onClick={() => onBlendChange('paint')}
        >
          Paint
        </button>
        <button
          type="button"
          className="lb-seg-btn"
          aria-pressed={blend === 'light'}
          onClick={() => onBlendChange('light')}
        >
          Light
        </button>
      </div>

      <PhotoButton
        onPress={() => {
          setOptionsOpen(false)
          onPhoto()
        }}
      />

      <button
        ref={moreRef}
        type="button"
        className={`lb-btn lb-btn-more${optionsOpen ? ' is-on' : ''}`}
        aria-label="More options"
        aria-expanded={optionsOpen}
        onClick={() => setOptionsOpen((v) => !v)}
      >
        <PlusIcon open={optionsOpen} />
      </button>

      <Options
        open={optionsOpen}
        slideCount={slideCount}
        warmth={warmth}
        glass={glass}
        onSlideCountChange={onSlideCountChange}
        onWarmthChange={onWarmthChange}
        onGlassChange={onGlassChange}
      />
    </div>
  )
}
