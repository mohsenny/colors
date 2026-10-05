import type { ReactElement } from 'react'
import { BODIES } from '../sky/bodies'
import type { BodyId, BodyKind } from '../sky/bodies'
import { Sphere } from './Sphere'

const KIND: Record<BodyKind, string> = { star: 'Star', planet: 'Planet', moon: 'Moon' }

export interface BodiesProps {
  open: boolean
  seat: BodyId
  onSelect(id: BodyId): void
}

/** The drawer behind the seat chip: the ten bodies you can be, Sun outward, on the number keys. */
export function Bodies({ open, seat, onSelect }: BodiesProps): ReactElement {
  return (
    <div className={`lb-options lt-bodies${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      {BODIES.map((b, i) => (
        <button
          key={b.id}
          type="button"
          className="lt-body-row"
          aria-pressed={seat === b.id}
          tabIndex={open ? undefined : -1}
          onClick={() => onSelect(b.id)}
        >
          <Sphere color={b.color} star={b.kind === 'star'} />
          <span className="lt-body-name">{b.name}</span>
          <span className="lt-body-kind">{KIND[b.kind]}</span>
          <span className="lt-body-key" aria-hidden="true">
            {(i + 1) % 10}
          </span>
        </button>
      ))}
    </div>
  )
}
