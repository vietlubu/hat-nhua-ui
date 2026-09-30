import { describe, expect, it } from 'vitest'
import { createEmptyDesign, upsertBead, type Design } from '../domain/design'
import { cornerFills, previewDimensions } from './ironPreview'

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