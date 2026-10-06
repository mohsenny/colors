import type { ReactElement } from 'react'

export interface Note {
  text: string
  /** When it was said, so the same words said again show again. */
  at: number
}

/**
 * A line over the dock saying what just happened, gone again on its own.
 * `onDone` takes the note back when its fade ends, so the status region is not
 * left holding words nobody can see.
 */
export function Toast({ note, onDone }: { note: Note | null; onDone: () => void }): ReactElement {
  return (
    <div className="lb-toast-at" role="status">
      {note && (
        <span key={note.at} className="lb-toast" onAnimationEnd={onDone}>
          {note.text}
        </span>
      )}
    </div>
  )
}
