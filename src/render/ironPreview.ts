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

export type CornerFill =
  /** Wedge of plastic melted into a reflex notch; (dx, dy) points into the notch. */
  | { kind: 'fillet'; x: number; y: number; dx: -1 | 1; dy: -1 | 1; color: string }
  /** Short neck fusing two beads that only touch at a corner. */
  | { kind: 'bridge'; x: number; y: number; color: string }

/**
 * Grid vertices where ironing adds material: the outer contour is the union of
 * the bead squares, so a 3-cell vertex is a sharp reflex notch and a diagonal
 * pair of cells meets at a single point instead of fusing.
 */
export function cornerFills(design: Design): CornerFill[] {
  const bounds = boundsFor(design)
  if (!bounds) return []
  const colors = new Map(design.beads.map((bead) => [`${bead.x},${bead.y}`, bead.color]))
  const at = (x: number, y: number): string | undefined => colors.get(`${x},${y}`)
  const fills: CornerFill[] = []
  for (let gy = bounds.minY; gy <= bounds.maxY + 1; gy += 1) {
    for (let gx = bounds.minX; gx <= bounds.maxX + 1; gx += 1) {
      const nw = at(gx - 1, gy - 1)
      const ne = at(gx, gy - 1)
      const sw = at(gx - 1, gy)
      const se = at(gx, gy)
      const occupied = (nw ? 1 : 0) + (ne ? 1 : 0) + (sw ? 1 : 0) + (se ? 1 : 0)
      if (occupied === 3) {
        // The missing cell is the notch; colour the wedge with the corner cell
        // across the vertex, which is the one the melted plastic flows from.
        if (!ne && sw) fills.push({ kind: 'fillet', x: gx, y: gy, dx: 1, dy: -1, color: sw })
        else if (!nw && se) fills.push({ kind: 'fillet', x: gx, y: gy, dx: -1, dy: -1, color: se })
        else if (!se && nw) fills.push({ kind: 'fillet', x: gx, y: gy, dx: 1, dy: 1, color: nw })
        else if (ne) fills.push({ kind: 'fillet', x: gx, y: gy, dx: -1, dy: 1, color: ne })
        continue
      }
      if (occupied !== 2) continue
      if (nw && se) fills.push({ kind: 'bridge', x: gx, y: gy, color: nw })
      else if (ne && sw) fills.push({ kind: 'bridge', x: gx, y: gy, color: ne })
    }
  }
  return fills
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
  // Ironed plastic spreads, so exposed corners round well past a square's radius.
  const radius = size * 0.34
  const fill = size * 0.3
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
  // Melted filler first, so the bead bodies and their shading stay on top.
  for (const corner of cornerFills(design)) {
    const px = options.padding + (corner.x - bounds.minX) * size
    const py = options.padding + (corner.y - bounds.minY) * size
    ctx.fillStyle = corner.color
    ctx.beginPath()
    if (corner.kind === 'bridge') {
      ctx.arc(px, py, fill, 0, Math.PI * 2)
    } else {
      // Rounded wedge between the two notch edges, tangent to both.
      ctx.moveTo(px + corner.dx * fill, py)
      ctx.arcTo(px, py, px, py + corner.dy * fill, fill)
      ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
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
