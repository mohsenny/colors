import type { ReactElement } from 'react'
import { PRESETS } from '../physics/bodies'
import type { BodyKind } from '../physics/bodies'
import { Sphere } from './Sphere'

const KIND: Record<BodyKind, string> = {
  planet: 'Planet',
  star: 'Star',
  dwarf: 'White dwarf',
  neutron: 'Neutron star',
  hole: 'Black hole',
}

export interface BodiesProps {
  open: boolean
  presetId: string | null
  onSelect(id: string): void
}

/** The drawer behind the body chip: the seven bodies, lightest to darkest. */
export function Bodies({ open, presetId, onSelect }: BodiesProps): ReactElement {
  return (
    <div className={`lb-options lt-bodies${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      {PRESETS.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className="lt-body-row"
          aria-pressed={presetId === p.id}
          tabIndex={open ? undefined : -1}
          onClick={() => onSelect(p.id)}
        >
          <Sphere color={p.color} hole={p.kind === 'hole'} />
          <span className="lt-body-name">{p.name}</span>
          <span className="lt-body-kind">{KIND[p.kind]}</span>
          <span className="lt-body-key" aria-hidden="true">
            {i + 1}
          </span>
        </button>
      ))}
    </div>
  )
}
