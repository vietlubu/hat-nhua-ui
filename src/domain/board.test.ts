import { describe, expect, it } from 'vitest'
import {
  cellsAlongSegment,
  screenToWorld,
  worldToScreen,
  type Viewport,
} from './board'

it('round-trips cells through screen coordinates at minimum and maximum zoom', () => {
  for (const zoom of [0.4, 1, 6]) {
    const viewport: Viewport = { offsetX: 17, offsetY: -11, zoom }
    for (const cell of [{ x: 0, y: 0 }, { x: -4, y: 3 }, { x: 8, y: -6 }]) {
      const screen = worldToScreen(cell, viewport, 640, 480, 24)
      expect(screenToWorld(screen, viewport, 640, 480, 24)).toEqual(cell)
    }
  }
})

describe('cellsAlongSegment', () => {
  it('includes every step for horizontal and vertical drags', () => {
    expect(cellsAlongSegment({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
    expect(cellsAlongSegment({ x: 0, y: 0 }, { x: 0, y: -2 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: -2 },
    ])
  })

  it('does not leave gaps on diagonal drags', () => {
    const cells = cellsAlongSegment({ x: -2, y: -2 }, { x: 3, y: 2 })
    for (let index = 1; index < cells.length; index += 1) {
      expect(Math.abs(cells[index].x - cells[index - 1].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(cells[index].y - cells[index - 1].y)).toBeLessThanOrEqual(1)
    }
    expect(cells[0]).toEqual({ x: -2, y: -2 })
    expect(cells.at(-1)).toEqual({ x: 3, y: 2 })
  })
})
