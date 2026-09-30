import type { Point } from '../domain/board'
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

/** How far melted plastic spills past its own cell, as a fraction of the cell size. */
const MELT_SPREAD = 0.13
const MELT_EDGE_MIN = 1.4
const MELT_EDGE_RANGE = 0.4
// Corners spill further than edges: four cells meeting at a grid vertex stay fused
// only while each corner curve bulges past that vertex.
const MELT_CORNER_MIN = 1.5
const MELT_CORNER_RANGE = 0.5

/**
 * Deterministic pseudo-random value in [0, 1) for one cell and channel, so the
 * same design always melts the same way — preview and exported PNG must match.
 */
function meltNoise(x: number, y: number, channel: number): number {
  let h = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x27d4eb2f) ^ Math.imul(channel, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

/**
 * Outline of one ironed bead: eight points in path order — four on-curve edge
 * midpoints bulging outwards, alternating with four off-curve corner controls.
 * Heat leaves the square cell unevenly, so every point sits outside it and
 * neighbours overlap instead of meeting at a straight seam.
 */
export function meltedBeadOutline(
  x: number,
  y: number,
  size: number,
  seedX: number,
  seedY: number,
): Point[] {
  const spread = size * MELT_SPREAD
  const edge = (channel: number): number =>
    spread * (MELT_EDGE_MIN + MELT_EDGE_RANGE * meltNoise(seedX, seedY, channel))
  const corner = (channel: number): number =>
    spread * (MELT_CORNER_MIN + MELT_CORNER_RANGE * meltNoise(seedX, seedY, channel))
  const midX = x + size / 2
  const midY = y + size / 2
  const right = x + size
  const bottom = y + size
  return [
    { x: midX, y: y - edge(0) },
    { x: right + corner(1), y: y - corner(2) },
    { x: right + edge(3), y: midY },
    { x: right + corner(4), y: bottom + corner(5) },
    { x: midX, y: bottom + edge(6) },
    { x: x - corner(7), y: bottom + corner(8) },
    { x: x - edge(9), y: midY },
    { x: x - corner(10), y: y - corner(11) },
  ]
}

function traceMeltedBead(ctx: CanvasRenderingContext2D, outline: Point[]): void {
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (let index = 1; index < outline.length; index += 2) {
    const control = outline[index]
    const end = outline[(index + 1) % outline.length]
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y)
  }
  ctx.closePath()
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
  const fill = size * 0.3
  const occupied = new Set(design.beads.map((bead) => `${bead.x},${bead.y}`))
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

    // Ironed beads melt past their cell and overlap their neighbours, so shared
    // edges fuse instead of meeting at a straight cut.
    const outline = meltedBeadOutline(x, y, size, bead.x, bead.y)
    traceMeltedBead(ctx, outline)
    ctx.fillStyle = bead.color
    ctx.fill()
    ctx.fillStyle = sheen
    ctx.fill()

    ctx.save()
    ctx.clip()
    // Rim light hugs the melted edge, which sits outside the cell on exposed sides.
    const rim = size * 0.045
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    if (!top) ctx.fillRect(x, outline[0].y, size, rim)
    if (!left) ctx.fillRect(outline[6].x, y, rim, size)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    if (!bottom) ctx.fillRect(x, outline[4].y - rim, size, rim)
    if (!right) ctx.fillRect(outline[2].x - rim, y, rim, size)
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
