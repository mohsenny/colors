import type { ReactElement } from 'react'
import type { Snapshot } from '../app/instrument'
import { Sphere } from './Sphere'

/** Top right, where the tray is in Lightbox: the real numbers for what is in the middle of the view. */
export function Readout({ snap }: { snap: Snapshot }): ReactElement {
  const { seat, look, readout } = snap
  return (
    <div className="lb-tray lt-readout">
      <div className="lb-tray-list">
        <div className="lt-readout-name">
          <Sphere color={look.color} star={look.kind === 'star'} />
          <span>{look.name}</span>
          {seat.id !== look.id && <span className="sl-from">from {seat.name}</span>}
        </div>
        {readout.map(([label, value]) => (
          <div key={label} className="lt-readout-row">
            <span className="lt-readout-label">{label}</span>
            <span className="lt-readout-value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
