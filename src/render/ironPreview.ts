import type { Design } from '../domain/design'

export interface PreviewOptions {
  pixelPerBead: number
  padding: number
  background: string
}

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = {
  pixelPerBead: 32,
  padding: 16,
  background: '#FFFFFF',
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function boundsFor(design: Design): Bounds | null {
  if (design.beads.length === 0) {
    return null
  }
  return design.beads.reduce<Bounds>(
    (bounds, bead) => ({
      minX: Math.min(bounds.minX, bead.x),
      minY: Math.min(bounds.minY, bead.y),
      maxX: Math.max(bounds.maxX, bead.x),
      maxY: Math.max(bounds.maxY, bead.y),
    }),
    {
      minX: design.beads[0].x,
      minY: design.beads[0].y,
      maxX: design.beads[0].x,
      maxY: design.beads[0].y,
    },
  )
}

export function previewDimensions(
  design: Design,
  options: PreviewOptions = DEFAULT_PREVIEW_OPTIONS,
): { width: number; height: number } {
  const bounds = boundsFor(design)
  if (!bounds) {
    return { width: options.padding * 2, height: options.padding * 2 }
  }
  return {
    width: (bounds.maxX - bounds.minX + 1) * options.pixelPerBead + options.padding * 2,
    height: (bounds.maxY - bounds.minY + 1) * options.pixelPerBead + options.padding * 2,
  }
}

export function renderIronedPreview(
  ctx: CanvasRenderingContext2D,
  design: Design,
  options: PreviewOptions = DEFAULT_PREVIEW_OPTIONS,
): { width: number; height: number } {
  const dimensions = previewDimensions(design, options)
  ctx.clearRect(0, 0, dimensions.width, dimensions.height)
  ctx.fillStyle = options.background
  ctx.fillRect(0, 0, dimensions.width, dimensions.height)

  const bounds = boundsFor(design)
  if (!bounds) {
    return dimensions
  }

  const size = options.pixelPerBead
  const radius = size * 0.24
  const occupied = new Set(design.beads.map((bead) => `${bead.x},${bead.y}`))
  // Back shared edges before antialiased cell fills, including downscaled PNGs.
  const overlap = size * 0.04
  for (const bead of design.beads) {
    const x = options.padding + (bead.x - bounds.minX) * size
    const y = options.padding + (bead.y - bounds.minY) * size
    ctx.fillStyle = bead.color
    if (occupied.has(`${bead.x + 1},${bead.y}`)) ctx.fillRect(x + size - overlap, y, overlap * 2, size)
    if (occupied.has(`${bead.x},${bead.y + 1}`)) ctx.fillRect(x, y + size - overlap, size, overlap * 2)
  }
  const sheen = ctx.createLinearGradient(0, options.padding, 0, dimensions.height - options.padding)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.12)')
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)')
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.08)')
  for (const bead of design.beads) {
    const x = options.padding + (bead.x - bounds.minX) * size
    const y = options.padding + (bead.y - bounds.minY) * size
    const top = occupied.has(`${bead.x},${bead.y - 1}`)
    const right = occupied.has(`${bead.x + 1},${bead.y}`)
    const bottom = occupied.has(`${bead.x},${bead.y + 1}`)
    const left = occupied.has(`${bead.x - 1},${bead.y}`)

    // Only exposed corners are rounded; shared edges meet without a gap.
    ctx.beginPath()
    ctx.roundRect(x, y, size, size, [
      top || left ? 0 : radius,
      top || right ? 0 : radius,
      bottom || right ? 0 : radius,
      bottom || left ? 0 : radius,
    ])
    ctx.fillStyle = bead.color
    ctx.fill()
    ctx.fillStyle = sheen
    ctx.fill()

    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    if (!top) ctx.fillRect(x, y, size, size * 0.045)
    if (!left) ctx.fillRect(x, y, size * 0.045, size)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    if (!bottom) ctx.fillRect(x, y + size * 0.955, size, size * 0.045)
    if (!right) ctx.fillRect(x + size * 0.955, y, size * 0.045, size)
    ctx.restore()

    // A small recessed opening remains after ironing, unlike the editor's peg hole.
    const centerX = x + size / 2
    const centerY = y + size / 2
    ctx.beginPath()
    ctx.ellipse(centerX, centerY, size * 0.085, size * 0.075, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(centerX, centerY + size * 0.015, size * 0.055, size * 0.045, 0, 0, Math.PI * 2)
    ctx.fillStyle = options.background
    ctx.fill()
  }

  return dimensions
}

export function renderPreviewToPng(design: Design): Promise<Blob> {
  const options = DEFAULT_PREVIEW_OPTIONS
  const dimensions = previewDimensions(design, options)
  const scale = Math.min(1, 4096 / Math.max(dimensions.width, dimensions.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(dimensions.width * scale))
  canvas.height = Math.max(1, Math.round(dimensions.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return Promise.reject(new Error('Không thể tạo ảnh PNG'))
  }
  ctx.scale(scale, scale)
  renderIronedPreview(ctx, design, options)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Không thể tạo ảnh PNG'))
      }
    }, 'image/png')
  })
}
