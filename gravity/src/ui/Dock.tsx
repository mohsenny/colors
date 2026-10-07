import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useIdle } from '../../../src/ui/idle'
import { PhotoButton } from '../../../src/ui/PhotoButton'
import type { Snapshot } from '../app/instrument'
import type { Kind } from '../physics/motion'
import { Bodies } from './Bodies'
import { PauseIcon, PlayIcon, PlusIcon } from './Icons'
import { Options } from './Options'
import { Sphere } from './Sphere'
import { Timeline } from './Timeline'
import type { TimelineProps } from './Timeline'

export interface DockProps {
  snap: Snapshot
  short: string
  timeline: TimelineProps
  onTogglePlay(): void
  onKind(k: Kind): void
  onPreset(id: string): void
  onMass(v: number): void
  onSize(v: number): void
  onSettle(): void
  onPhoto(): void
}

type Drawer = 'bodies' | 'options' | null

export function Dock(props: DockProps): ReactElement {
  const { snap, short, timeline, onTogglePlay, onKind, onPreset, onMass, onSize, onSettle, onPhoto } = props
  const { playing } = snap
  const [drawer, setDrawer] = useState<Drawer>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)

  useIdle(drawer !== null)

  // A drawer is a transient layer: touching anything else, or Escape, puts it away.
  useEffect(() => {
    if (!drawer) return
    const away = (e: PointerEvent): void => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      setDrawer(null)
    }
    const escape = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      ;(drawer === 'bodies' ? bodyRef : moreRef).current?.focus()
      setDrawer(null)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', escape, true)
    }
  }, [drawer])

  const toggle = (d: Exclude<Drawer, null>): void => setDrawer((v) => (v === d ? null : d))

  return (
    <div
      ref={rootRef}
      className={`lb-dock${timeline.expanded ? ' is-expanded' : ''}`}
    >
      {/* First, as New is in Lightbox: the body is what the instrument is about. */}
      <button
        ref={bodyRef}
        type="button"
        className={`lt-chip${drawer === 'bodies' ? ' is-on' : ''}`}
        aria-label={`Body: ${snap.name}. Choose another`}
        aria-expanded={drawer === 'bodies'}
        onClick={() => toggle('bodies')}
      >
        <Sphere color={snap.color} hole={snap.hole} />
        <span className="lt-chip-label" aria-hidden="true">
          {short}
        </span>
      </button>

      <button type="button" className="lb-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <Timeline {...timeline} />

      {/* Two equal cells, so the half-width indicator sits under either word. */}
      <div className="lb-seg lb-seg-2" role="group" aria-label="What moves in the room" data-mode={snap.kind}>
        <span className="lb-seg-indicator" aria-hidden="true" />
        <button type="button" className="lb-seg-btn" aria-pressed={snap.kind === 'probe'} onClick={() => onKind('probe')}>
          Probe
        </button>
        <button type="button" className="lb-seg-btn" aria-pressed={snap.kind === 'light'} onClick={() => onKind('light')}>
          Photon
        </button>
      </div>

      <PhotoButton
        onPress={() => {
          setDrawer(null)
          onPhoto()
        }}
      />

      <button
        ref={moreRef}
        type="button"
        className={`lb-btn lb-btn-more${drawer === 'options' ? ' is-on' : ''}`}
        aria-label="More options"
        aria-expanded={drawer === 'options'}
        onClick={() => toggle('options')}
      >
        <PlusIcon open={drawer === 'options'} />
      </button>

      <Bodies
        open={drawer === 'bodies'}
        presetId={snap.presetId}
        onSelect={(id) => {
          onPreset(id)
          setDrawer(null)
        }}
      />
      <Options
        open={drawer === 'options'}
        massLog={snap.massLog}
        sizeLog={snap.sizeLog}
        hole={snap.hole}
        onMass={onMass}
        onSize={onSize}
        onSettle={onSettle}
      />
    </div>
  )
}
