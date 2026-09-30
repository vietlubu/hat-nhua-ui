import { afterEach, expect, it, vi } from 'vitest'
import { createEmptyDesign } from './design'
import { LIBRARY_STORAGE_KEY, loadLibrary, loadLibraryWithStatus, saveLibrary } from './storage'

const data = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
})

afterEach(() => {
  data.clear()
  vi.restoreAllMocks()
})

it('persists multiple designs and the selected design including negative coordinates', () => {
  const first = createEmptyDesign('Đầu')
  first.beads = [{ x: -3, y: 5, color: '#E53935' }]
  const second = createEmptyDesign('Sau')
  saveLibrary({ version: 1, currentId: first.id, designs: [first, second] })
  const loaded = loadLibrary()
  expect(loaded.currentId).toBe(first.id)
  expect(loaded.designs).toEqual([first, second])
})

it('retains corrupt original data and reports a readable load error', () => {
  data.set(LIBRARY_STORAGE_KEY, '{invalid')
  const result = loadLibraryWithStatus()
  expect(result.error).toBe('Không đọc được dữ liệu cũ')
  expect(data.get(LIBRARY_STORAGE_KEY)).toBe('{invalid')
  expect(result.library.designs[0].beads).toEqual([])
  expect(result.library.currentId).toBe(result.library.designs[0].id)
})

it('opens a new valid design when the stored library is empty', () => {
  data.set(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, currentId: null, designs: [] }))
  const loaded = loadLibrary()
  expect(loaded.designs[0].beads).toEqual([])
  expect(loaded.currentId).toBe(loaded.designs[0].id)
})

it('propagates quota failures without changing the original library', () => {
  const first = createEmptyDesign('Đầu')
  const library = { version: 1 as const, currentId: first.id, designs: [first] }
  saveLibrary(library)
  const original = data.get(LIBRARY_STORAGE_KEY)
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
  expect(() => saveLibrary({ ...library, designs: [{ ...first, name: 'Changed' }] })).toThrow('Full')
  expect(data.get(LIBRARY_STORAGE_KEY)).toBe(original)
})
