import { Fragment } from 'react'
import type { ReactElement } from 'react'
import { BODIES, KEYED } from '../sky/bodies'
import type { Body, BodyId, BodyKind } from '../sky/bodies'
import { Sphere } from './Sphere'

const KIND: Record<BodyKind, string> = { star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', moon: 'Moon' }

/** The moons with no key of their own, under their planet. */
const MOONS = new Map<BodyId, Body[]>(
  KEYED.map((b) => [b.id, BODIES.filter((m) => m.parent === b.id && !KEYED.includes(m))]),
)

export interface BodiesProps {
  open: boolean
  seat: BodyId
  onSelect(id: BodyId): void
}

/**
 * The drawer behind the seat chip: the Sun, the planets and Pluto, Sun
 * outward, each with its key, and the moons of Jupiter, Saturn and Pluto
 * under what they go round.
 */
export function Bodies({ open, seat, onSelect }: BodiesProps): ReactElement {
  const tab = open ? undefined : -1
  return (
    <div className={`lb-options lt-bodies${open ? ' is-open' : ''}`} aria-hidden={open ? undefined : 'true'}>
      {KEYED.map((b, i) => (
        <Fragment key={b.id}>
          <button
            type="button"
            className="lt-body-row"
            aria-pressed={seat === b.id}
            tabIndex={tab}
            onClick={() => onSelect(b.id)}
          >
            <Sphere color={b.color} star={b.kind === 'star'} />
            <span className="lt-body-name">{b.name}</span>
            <span className="lt-body-kind">{KIND[b.kind]}</span>
            <span className="lt-body-key" aria-hidden="true">
              {i === 0 ? 'S' : i % 10}
            </span>
          </button>
          {MOONS.get(b.id)?.length ? (
            <div className="lt-moons" role="group" aria-label={`Moons of ${b.name}`}>
              {MOONS.get(b.id)?.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="lt-moon"
                  aria-pressed={seat === m.id}
                  tabIndex={tab}
                  onClick={() => onSelect(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
