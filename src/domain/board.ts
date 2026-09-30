export interface Viewport {
  offsetX: number
  offsetY: number
  zoom: number
}

export interface Point {
  x: number
  y: number
}

export interface Cell {
  x: number
  y: number
}

export const BASE_CELL_PX = 24
export const MIN_ZOOM = 0.4
export const MAX_ZOOM = 6

function cellSize(viewport: Viewport, baseCellPx: number): number {
  return baseCellPx * viewport.zoom
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function worldToScreen(
  cell: Cell,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  baseCellPx: number,
): Point {
  const size = cellSize(viewport, baseCellPx)
  return {
    x: canvasWidth / 2 + viewport.offsetX + cell.x * size,
    y: canvasHeight / 2 + viewport.offsetY + cell.y * size,
  }
}

export function screenToWorld(
  point: Point,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  baseCellPx: number,
): Cell {
  const size = cellSize(viewport, baseCellPx)
  return {
    x: Math.floor((point.x - canvasWidth / 2 - viewport.offsetX) / size + 0.5),
    y: Math.floor((point.y - canvasHeight / 2 - viewport.offsetY) / size + 0.5),
  }
}

export function cellsAlongSegment(from: Cell, to: Cell): Cell[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) {
    return [{ ...from }]
  }

  const cells: Cell[] = []
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps
    const cell = {
      x: Math.round(from.x + dx * progress),
      y: Math.round(from.y + dy * progress),
    }
    const previous = cells[cells.length - 1]
    if (!previous || previous.x !== cell.x || previous.y !== cell.y) {
      cells.push(cell)
    }
  }
  return cells
}
