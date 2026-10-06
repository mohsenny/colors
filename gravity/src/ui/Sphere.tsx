import type { CSSProperties, ReactElement } from 'react'

/** The body at chip size: lit from the upper left, as it is in the room. */
export function Sphere({ color, hole, size = 14 }: { color: string; hole: boolean; size?: number }): ReactElement {
  const style = { '--lt-body': color, width: size, height: size } as CSSProperties
  return <span className={`lt-sphere${hole ? ' is-hole' : ''}`} style={style} aria-hidden="true" />
}
