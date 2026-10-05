import type { CSSProperties, ReactElement } from 'react'

/** The body at chip size, lit from the upper left. The Sun is lit from within. */
export function Sphere({ color, star = false, size = 14 }: { color: string; star?: boolean; size?: number }): ReactElement {
  const style = { '--lt-body': color, width: size, height: size } as CSSProperties
  return <span className={`lt-sphere${star ? ' is-star' : ''}`} style={style} aria-hidden="true" />
}
