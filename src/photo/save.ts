/*
 * A photograph of an instrument, shared by all three: the picture as a PNG,
 * handed to the browser as a download under the name a Mac gives a
 * screenshot, so the pictures sort by when they were taken.
 */

/**
 * A canvas as a PNG. The copy is taken when this is called, so a WebGL canvas
 * has to be drawn in the same task: once the frame is shown its buffer is
 * gone.
 */
export function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The canvas gave no picture'))), 'image/png')
  })
}

/**
 * Takes a picture and saves it. Only a failure has a note for over the dock:
 * where the picture went is the browser's to say, as some ask first.
 */
export function savePhoto(app: string, take: () => Promise<Blob>): Promise<string | null> {
  return take().then(
    (blob) => {
      download(blob, photoName(app))
      return null
    },
    () => 'The picture could not be taken',
  )
}

/** Saves without asking where, unless the browser has been told to ask. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Long after the download has read it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** "Solar 2026-10-06 at 09.55.34.png". */
export function photoName(app: string, at = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`
  return `${app} ${day} at ${two(at.getHours())}.${two(at.getMinutes())}.${two(at.getSeconds())}.png`
}
