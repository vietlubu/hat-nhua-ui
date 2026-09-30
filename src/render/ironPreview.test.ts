import { describe, expect, it } from 'vitest'
import { createEmptyDesign, upsertBead } from '../domain/design'
import { previewDimensions } from './ironPreview'

describe('iron preview dimensions', () => {
  it('fits the sparse design bounds including negative coordinates', () => {
    let design = createEmptyDesign('Test', '2026-01-01T00:00:00.000Z')
    design = upsertBead(design, { x: -2, y: 3, color: '#FFFFFF' })
    design = upsertBead(design, { x: 1, y: 4, color: '#000000' })
    expect(previewDimensions(design)).toEqual({ width: 160, height: 96 })
  })
})
