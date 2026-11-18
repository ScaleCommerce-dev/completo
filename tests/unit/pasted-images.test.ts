import { describe, it, expect } from 'vitest'
import { pastedImageFiles, namePastedImage } from '../../app/utils/pasted-images'

/** The parts of a DataTransfer the paste handlers read. */
function clipboard(files: File[], data: Record<string, string> = {}) {
  return { files, getData: (type: string) => data[type] ?? '' } as unknown as DataTransfer
}

const png = (name = 'image.png') => new File(['x'], name, { type: 'image/png' })

describe('pastedImageFiles', () => {
  it('takes a screenshot, which arrives as a file and nothing else', () => {
    const shot = png()
    expect(pastedImageFiles(clipboard([shot]))).toEqual([shot])
  })

  it('takes an image copied from a browser, which wraps it in HTML', () => {
    const img = png()
    expect(pastedImageFiles(clipboard([img], { 'text/html': '<img src="https://x/y.png">' }))).toEqual([img])
  })

  it('leaves the picture of copied spreadsheet cells alone, because the text is what was copied', () => {
    expect(pastedImageFiles(clipboard([png()], { 'text/plain': 'a\tb\tc' }))).toEqual([])
  })

  it('ignores files that are not images, and an empty or missing clipboard', () => {
    expect(pastedImageFiles(clipboard([new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })]))).toEqual([])
    expect(pastedImageFiles(clipboard([]))).toEqual([])
    expect(pastedImageFiles(null)).toEqual([])
  })
})

describe('namePastedImage', () => {
  const at = new Date(2026, 10, 18, 9, 5, 7)

  it('gives the browser\'s generic "image.png" a timestamped name', () => {
    const named = namePastedImage(png(), at)
    expect(named.name).toBe('screenshot-2026-11-18-09-05-07.png')
    expect(named.type).toBe('image/png')
  })

  it('names the extension after the type', () => {
    expect(namePastedImage(new File(['x'], 'image.jpeg', { type: 'image/jpeg' }), at).name).toBe('screenshot-2026-11-18-09-05-07.jpg')
  })

  it('keeps a real file name', () => {
    const file = png('Wireframe Startseite.png')
    expect(namePastedImage(file, at)).toBe(file)
  })
})
