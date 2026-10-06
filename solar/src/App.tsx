import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Instrument } from './app/instrument'
import type { Snapshot } from './app/instrument'
import { KEYED } from './sky/bodies'
import { Dock } from './ui/Dock'
import { Legend } from './ui/Legend'
import { Readout } from './ui/Readout'
import { Title } from '../../src/ui/Title'

function Chrome({ instrument }: { instrument: Instrument }): ReactElement {
  const snap: Snapshot = useSyncExternalStore(instrument.subscribe, instrument.getSnapshot)
  const attachClock = useCallback(
    (day: HTMLElement | null, time: HTMLElement | null) => instrument.attachClock(day, time),
    [instrument],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT') return
      if (e.key === ' ') {
        // A focused button would also take the space as a click.
        if (t?.tagName === 'BUTTON') return
        e.preventDefault()
        instrument.togglePlay()
      } else if (e.key === ',' || e.key === '<') {
        instrument.slower()
      } else if (e.key === '.' || e.key === '>') {
        instrument.faster()
      } else if (e.key === 'n' || e.key === 'N') {
        instrument.now()
      } else if (e.key === 'Escape') {
        instrument.lookHome()
      } else if (/^[0-9]$/.test(e.key)) {
        const b = KEYED[(Number(e.key) + 9) % 10]
        if (b) instrument.become(b.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [instrument])

  return (
    <>
      <Readout snap={snap} />
      <Legend />
      <Dock
        snap={snap}
        attachClock={attachClock}
        timeline={{
          position: snap.position,
          filled: snap.filled,
          marks: snap.marks,
          expanded: snap.expanded,
          moment: snap.moment,
          onScrub: (p) => instrument.scrub(p),
          onScrubStart: () => instrument.scrubStart(),
          onScrubEnd: () => instrument.scrubEnd(),
        }}
        onTogglePlay={() => instrument.togglePlay()}
        onDial={(dial) => instrument.setDial(dial)}
        onBecome={(id) => instrument.become(id)}
        onWatch={(e) => instrument.watch(e)}
        onNow={() => instrument.now()}
      />
      <div className="lb-sr" aria-live="polite">
        {snap.announce}
      </div>
    </>
  )
}

export default function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const labelsRef = useRef<HTMLDivElement | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [failed] = useState(() => !document.createElement('canvas').getContext('webgl2'))

  useEffect(() => {
    const canvas = canvasRef.current
    const labels = labelsRef.current
    if (!canvas || !labels || failed) return
    const inst = new Instrument(canvas, labels)
    inst.start()
    setInstrument(inst)
    return () => {
      inst.stop()
      setInstrument(null)
    }
  }, [failed])

  return (
    <main className="lb-stage">
      <canvas ref={canvasRef} className="sl-canvas" aria-label="The Sun, the planets, the Moon and the moons of Jupiter and Saturn where they are now, at their true sizes and distances" />
      <div ref={labelsRef} className="sl-labels" aria-hidden="true" />
      <Title active="solar" />
      {failed && <p className="lt-fail">This needs WebGL2, which this browser does not offer.</p>}
      {instrument && <Chrome instrument={instrument} />}
    </main>
  )
}
