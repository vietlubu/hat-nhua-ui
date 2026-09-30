import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { contrastTextColor, loadPalette, PALETTE, PALETTE_STORAGE_KEY, savePalette } from './palette'

const data = new Map<string, string>()
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => {
  data.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('retains custom colors, deleted defaults, and an intentionally empty palette after reloading', () => {
  const custom = { id: '#123456', label: '#123456', hex: '#123456' }
  const colors = loadPalette().colors.filter((color) => color.hex !== '#E53935')
  savePalette([...colors, custom])
  expect(loadPalette().colors).toEqual([...colors, custom])
  savePalette([])
  expect(loadPalette().colors).toEqual([])
})

it('normalizes and deduplicates stored color values without accepting invalid colors', () => {
  data.set(PALETTE_STORAGE_KEY, '["#abcdef","#ABCDEF"]')
  expect(loadPalette().colors.map((color) => color.hex)).toEqual(['#ABCDEF'])
  for (const invalid of ['{broken', '{}', '["red"]', '[null]', '["#12345G"]']) {
    data.set(PALETTE_STORAGE_KEY, invalid)
    expect(loadPalette().error).toBe('Không đọc được bảng màu đã lưu')
    expect(data.get(PALETTE_STORAGE_KEY)).toBe(invalid)
  }
})

it('propagates failed writes without discarding the previously stored palette', () => {
  savePalette([{ id: '#123456', label: '#123456', hex: '#123456' }])
  const previous = data.get(PALETTE_STORAGE_KEY)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  expect(() => savePalette([])).toThrow('Full')
  expect(data.get(PALETTE_STORAGE_KEY)).toBe(previous)
})

it('picks the palette text color with the higher contrast ratio', () => {
  const ratio = (a: string, b: string): number => {
    const luminance = (hex: string): number =>
      [1, 3, 5].reduce((sum, i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return sum + [0.2126, 0.7152, 0.0722][(i - 1) / 2] * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      }, 0)
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }
  for (const color of [...PALETTE, { hex: '#123456' }, { hex: '#7F7F7F' }, { hex: '#00FF00' }]) {
    const text = contrastTextColor(color.hex)
    expect(ratio(color.hex, text)).toBeGreaterThanOrEqual(ratio(color.hex, text === '#FFFFFF' ? '#000000' : '#FFFFFF'))
    expect(ratio(color.hex, text)).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrastTextColor('#FFFFFF')).toBe('#000000')
  expect(contrastTextColor('#000000')).toBe('#FFFFFF')
})
