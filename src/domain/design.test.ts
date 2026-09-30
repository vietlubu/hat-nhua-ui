import { describe, expect, it } from 'vitest'
import {
  createEmptyDesign,
  normalizeDesign,
  parseDesignJson,
  serializeDesignJson,
  upsertBead,
} from './design'

function fixture() {
  return {
    version: 1,
    id: 'fixture',
    name: 'Mẫu',
    beads: [
      { x: -2, y: 1, color: '#e53935' },
      { x: 0, y: 0, color: '#1e88e5' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('design data', () => {
  it('round-trips negative coordinates and canonical colors', () => {
    const design = parseDesignJson(JSON.stringify(fixture()))
    const roundTrip = parseDesignJson(serializeDesignJson(design))
    expect(roundTrip.beads).toEqual([
      { x: 0, y: 0, color: '#1E88E5' },
      { x: -2, y: 1, color: '#E53935' },
    ])
  })

  it('keeps the last duplicate coordinate', () => {
    const design = normalizeDesign({
      ...fixture(),
      beads: [
        { x: 0, y: 0, color: '#FFFFFF' },
        { x: 0, y: 0, color: '#000000' },
      ],
    })
    expect(design.beads).toEqual([{ x: 0, y: 0, color: '#000000' }])
  })

  it('rejects invalid version, coordinates, and colors', () => {
    expect(() => parseDesignJson(JSON.stringify({ ...fixture(), version: 2 }))).toThrow()
    expect(() => parseDesignJson(JSON.stringify({ ...fixture(), beads: [{ x: 1.5, y: 0, color: '#FFFFFF' }] }))).toThrow()
    expect(() => parseDesignJson(JSON.stringify({ ...fixture(), beads: [{ x: 0, y: 0, color: 'red' }] }))).toThrow()
    expect(() => parseDesignJson(JSON.stringify({ ...fixture(), updatedAt: 'not-a-date' }))).toThrow('Thời gian thiết kế không hợp lệ')
  })

  it('replaces a bead without creating a duplicate', () => {
    const design = upsertBead(createEmptyDesign('Test'), { x: 0, y: 0, color: '#ffffff' })
    const updated = upsertBead(design, { x: 0, y: 0, color: '#000000' })
    expect(updated.beads).toEqual([{ x: 0, y: 0, color: '#000000' }])
  })
})
