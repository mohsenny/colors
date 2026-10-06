import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Instrument } from './app/instrument'
import type { Snapshot } from './app/instrument'
import { PRESETS, presetById } from './physics/bodies'
import { Dock } from './ui/Dock'
import { Legend } from './ui/Legend'
import { Readout } from './ui/Readout'
import { savePhoto } from '../../src/photo/save'
import { Title } from '../../src/ui/Title'
import { Toast } from '../../src/ui/Toast'
import type { Note } from '../../src/ui/Toast'

function Chrome({ instrument }: { instrument: Instrument }): ReactElement {
  const snap: Snapshot = useSyncExternalStore(instrument.subscribe, instrument.getSnapshot)
  const [note, setNote] = useState<Note | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const typing = t?.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'
      if (typing) return
      if (e.key === ' ') {
        // A focused button would also take the space as a click.
        if (t?.tagName === 'BUTTON' || t?.tagName === 'INPUT') return
        e.preventDefault()
        instrument.togglePlay()
      } else if (e.key === 'r' || e.key === 'R') {
        instrument.reset()
      } else if (e.key === 'Escape') {
        instrument.stepOff()
      } else if (e.key === 'l' || e.key === 'L') {
        instrument.toggleKind()
      } else if (/^[1-9]$/.test(e.key)) {
        const p = PRESETS[Number(e.key) - 1]
        if (p) instrument.selectPreset(p.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [instrument])

  const preset = snap.presetId ? presetById(snap.presetId) : undefined

  return (
    <>
      <Readout snap={snap} />
      <Legend riding={snap.riding} />
      <Dock
        snap={snap}
        short={preset?.short ?? (snap.hole ? 'Hole' : 'Custom')}
        timeline={{
          position: snap.position,
          filled: snap.filled,
          expanded: snap.expanded,
          onScrub: (p) => instrument.scrub(p),
          onScrubStart: () => instrument.scrubStart(),
          onScrubEnd: () => instrument.scrubEnd(),
        }}
        onTogglePlay={() => instrument.togglePlay()}
        onKind={(k) => instrument.setKind(k)}
        onPreset={(id) => instrument.selectPreset(id)}
        onMass={(v) => instrument.setMassLog(v)}
        onSize={(v) => instrument.setSizeLog(v)}
        onSettle={() => instrument.settleBody()}
        onPhoto={() => {
          void savePhoto('Gravity', () => instrument.photo()).then(
            (text) => text && setNote({ text, at: Date.now() }),
          )
        }}
      />
      <Toast note={note} onDone={() => setNote(null)} />
      <div className="lb-sr" aria-live="polite">
        {snap.announce}
      </div>
    </>
  )
}

export default function App(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tabRef = useRef<HTMLDivElement | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [failed] = useState(() => !document.createElement('canvas').getContext('webgl2'))

  useEffect(() => {
    const canvas = canvasRef.current
    const tab = tabRef.current
    if (!canvas || !tab || failed) return
    const inst = new Instrument(canvas, tab)
    inst.start()
    setInstrument(inst)
    return () => {
      inst.stop()
      setInstrument(null)
    }
  }, [failed])

  return (
    <main className="lb-stage">
      <canvas ref={canvasRef} className="lt-canvas" aria-label="A lattice of space around a body, with particles moving through it" />
      <div ref={tabRef} className="lt-tab" aria-hidden="true" />
      <Title active="gravity" />
      {failed && <p className="lt-fail">This needs WebGL2, which this browser does not offer.</p>}
      {instrument && <Chrome instrument={instrument} />}
    </main>
  )
}
