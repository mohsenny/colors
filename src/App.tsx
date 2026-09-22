import { useEffect, useRef, useState } from 'react'
import { Instrument } from './app/instrument'
import type { InstrumentSnapshot } from './app/instrument'
import { Dock } from './ui/Dock'
import { PaletteTray } from './ui/PaletteTray'
import { Wordmark } from './ui/Wordmark'

/**
 * React owns the chrome and nothing else. The stage below is an empty div that
 * the Instrument fills imperatively, so the animation loop never causes a render.
 */
export default function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  // State, not a ref: the chrome below renders from it, and a ref read during
  // render is a value React has no way to re-render for.
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [snapshot, setSnapshot] = useState<InstrumentSnapshot | null>(null)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const inst = new Instrument(el)
    setInstrument(inst)
    setSnapshot(inst.getSnapshot())
    const unsubscribe = inst.subscribe(() => setSnapshot(inst.getSnapshot()))
    inst.start()
    return () => {
      unsubscribe()
      inst.destroy()
      setInstrument(null)
    }
  }, [])

  useEffect(() => {
    if (!instrument) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      // Space keeps its native meaning on real buttons only: the dock, the tray,
      // a slide's copy and lock. On a focused slide frame it pauses, even though
      // the frame is a role="button" and Space would normally activate it. A
      // slide gets focus from a single click, so honouring the convention meant
      // Space silently stopped being Play/Pause as soon as the user touched a
      // sheet, which is exactly when they want to stop the motion.
      const onButton = !!target?.closest('button')
      const typing = !!target?.closest('input[type="text"], textarea, [contenteditable="true"]')

      switch (event.code) {
        case 'Space':
          if (onButton) return
          event.preventDefault()
          instrument.togglePlay()
          return
        case 'KeyR':
          if (typing) return
          instrument.regenerate()
          return
        case 'KeyB':
          if (typing) return
          instrument.toggleBlend()
          return
        case 'Escape':
          instrument.select(null)
          return
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [instrument])

  return (
    <>
      <div className="lb-stage" ref={stageRef} />
      <Wordmark />
      {snapshot && instrument ? (
        <>
          <PaletteTray
            pinned={snapshot.pinned}
            onUnpin={(id) => instrument.unpin(id)}
            onSelect={(id) => instrument.select(id)}
            onCopy={(hex) => instrument.copyHex(hex)}
          />
          <Dock
            playing={snapshot.playing}
            blend={snapshot.blend}
            timeline={{
              position: snapshot.position,
              filled: snapshot.filled,
              expanded: snapshot.expanded,
              onScrub: (p) => instrument.scrubTo(p),
              onScrubStart: () => instrument.beginScrub(),
              onScrubEnd: () => instrument.endScrub(),
            }}
            onTogglePlay={() => instrument.togglePlay()}
            onRegenerate={() => instrument.regenerate()}
            onBlendChange={(mode) => instrument.setBlend(mode)}
          />
          <p className="lb-sr" role="status" aria-live="polite">
            {snapshot.announcement}
          </p>
        </>
      ) : null}
    </>
  )
}
