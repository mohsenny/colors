import type { ReactElement } from 'react'
import type { Snapshot } from '../app/instrument'
import { Sphere } from './Sphere'

/** Top right, where the tray is in Lightbox: the real numbers for what is drawn. */
export function Readout({ snap }: { snap: Snapshot }): ReactElement {
  const { readout, hole } = snap
  const rows: Array<[string, string]> = [
    ['Mass', readout.mass],
    [hole ? 'Horizon' : 'Radius', readout.radius],
    ['Clock', hole ? 'stops' : readout.clock],
    ['Drawn', readout.drawn],
  ]
  return (
    <div className="lb-tray lt-readout">
      <div className="lb-tray-list">
        <div className="lt-readout-name">
          <Sphere color={snap.color} hole={hole} />
          <span>{snap.name}</span>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="lt-readout-row">
            <span className="lt-readout-label">{label}</span>
            <span className="lt-readout-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
