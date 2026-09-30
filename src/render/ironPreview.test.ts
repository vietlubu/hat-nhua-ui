import { describe, expect, it } from 'vitest'
import { createEmptyDesign, upsertBead, type Design } from '../domain/design'
import { cornerFills, meltedBeadOutline, previewDimensions } from './ironPreview'

function designOf(cells: Array<[number, number]>, color = '#E53935'): Design {
  let design = createEmptyDesign('Test', '2026-01-01T00:00:00.000Z')
  for (const [x, y] of cells) design = upsertBead(design, { x, y, color })
  return design
}

describe('iron preview dimensions', () => {
  it('fits the sparse design bounds including negative coordinates', () => {
    let design = createEmptyDesign('Test', '2026-01-01T00:00:00.000Z')
    design = upsertBead(design, { x: -2, y: 3, color: '#FFFFFF' })
    design = upsertBead(design, { x: 1, y: 4, color: '#000000' })
    expect(previewDimensions(design)).toEqual({ width: 160, height: 96 })
  })
})

describe('ironed corner fills', () => {
  it('leaves solid blocks and straight runs untouched', () => {
    expect(cornerFills(designOf([[0, 0], [1, 0], [0, 1], [1, 1]]))).toEqual([])
    expect(cornerFills(designOf([[0, 0], [1, 0], [2, 0]]))).toEqual([])
  })

  it('fills the reflex notch where an L bends, aiming into the missing quadrant', () => {
    let design = designOf([[0, 0], [0, 1]])
    design = upsertBead(design, { x: 1, y: 1, color: '#1E88E5' })
    // Vertex (1, 1) is missing its north-east cell, so the wedge fills down-right.
    expect(cornerFills(design)).toEqual([
      { kind: 'fillet', x: 1, y: 1, dx: 1, dy: -1, color: '#E53935' },
    ])
  })

  it('bridges beads that only meet at a corner', () => {
    expect(cornerFills(designOf([[0, 0], [1, 1]]))).toEqual([
      { kind: 'bridge', x: 1, y: 1, color: '#E53935' },
    ])
  })
})

describe('melted bead outline', () => {
  const size = 32
  // How far a point sits outside the square cell it belongs to.
  const spill = (x: number, y: number, originX: number, originY: number): number =>
    Math.max(
      originX - x,
      x - (originX + size),
      originY - y,
      y - (originY + size),
    )

  it('pushes every point past the cell, by a bounded but visible margin', () => {
    const points = meltedBeadOutline(100, 40, size, 3, -7)
    expect(points).toHaveLength(8)
    for (const point of points) {
      expect(spill(point.x, point.y, 100, 40)).toBeGreaterThan(size * 0.15)
      expect(spill(point.x, point.y, 100, 40)).toBeLessThanOrEqual(size * 0.27)
    }
  })

  it('bulges every corner curve past the cell corner, so four beads fuse at a junction', () => {
    const points = meltedBeadOutline(0, 0, size, 2, 9)
    // Corner curves in path order: top-left, top-right, bottom-right, bottom-left.
    const corners: Array<[number, number, number]> = [
      [6, 7, 0],
      [0, 1, 2],
      [2, 3, 4],
      [4, 5, 6],
    ]
    for (const [start, control, end] of corners) {
      const midpoint = {
        x: (points[start].x + 2 * points[control].x + points[end].x) / 4,
        y: (points[start].y + 2 * points[control].y + points[end].y) / 4,
      }
      const pastX = midpoint.x < 0 || midpoint.x > size
      const pastY = midpoint.y < 0 || midpoint.y > size
      expect(pastX && pastY).toBe(true)
    }
  })

  it('melts the same cell identically and differently shaped cells differently', () => {
    expect(meltedBeadOutline(10, 20, size, 4, 5)).toEqual(meltedBeadOutline(10, 20, size, 4, 5))
    expect(meltedBeadOutline(10, 20, size, 4, 5)).not.toEqual(meltedBeadOutline(10, 20, size, 4, 6))
  })

  it('overlaps horizontal neighbours well past the shared edge', () => {
    const left = meltedBeadOutline(0, 0, size, 0, 0)
    const right = meltedBeadOutline(size, 0, size, 1, 0)
    // Rightmost point of the left bead and leftmost of the right bead, both at the seam's height.
    expect(right[2].x - left[6].x).toBeGreaterThan(size * 0.3)
  })
})