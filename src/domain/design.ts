export interface Bead {
  x: number
  y: number
  color: string
}

export interface Design {
  version: 1
  id: string
  name: string
  beads: Bead[]
  createdAt: string
  updatedAt: string
}

export interface DesignLibrary {
  version: 1
  currentId: string | null
  designs: Design[]
}

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Dữ liệu thiết kế không hợp lệ')
  }
  return value as Record<string, unknown>
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canonicalColor(value: unknown): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) {
    throw new Error('Màu hạt phải có dạng #RRGGBB')
  }
  return value.toUpperCase()
}

function integerCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Tọa độ hạt phải là số nguyên')
  }
  return value
}

function sortBeads(beads: Bead[]): Bead[] {
  return beads.sort((a, b) => a.y - b.y || a.x - b.x)
}

export function createEmptyDesign(name: string, now = new Date().toISOString()): Design {
  const safeName = name.trim() || 'Thiết kế mới'
  return {
    version: 1,
    id: makeId(),
    name: safeName,
    beads: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function beadKey(x: number, y: number): string {
  return `${x},${y}`
}

export function normalizeDesign(input: unknown): Design {
  const value = recordValue(input)
  if (value.version !== 1) {
    throw new Error('Phiên bản JSON không được hỗ trợ')
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    throw new Error('Thiết kế thiếu id')
  }
  if (typeof value.name !== 'string') {
    throw new Error('Thiết kế thiếu tên')
  }
  if (!Array.isArray(value.beads)) {
    throw new Error('Thiết kế thiếu danh sách hạt')
  }
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new Error('Thiết kế thiếu thời gian')
  }
  if (!Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error('Thời gian thiết kế không hợp lệ')
  }

  const beads = new Map<string, Bead>()
  for (const rawBead of value.beads) {
    const bead = recordValue(rawBead)
    const x = integerCoordinate(bead.x)
    const y = integerCoordinate(bead.y)
    const normalized: Bead = {
      x,
      y,
      color: canonicalColor(bead.color),
    }
    beads.set(beadKey(normalized.x, normalized.y), normalized)
  }

  return {
    version: 1,
    id: value.id,
    name: value.name.trim() || 'Thiết kế không tên',
    beads: sortBeads([...beads.values()]),
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  }
}

export function upsertBead(design: Design, bead: Bead): Design {
  const color = canonicalColor(bead.color)
  if (!Number.isSafeInteger(bead.x) || !Number.isSafeInteger(bead.y)) {
    throw new Error('Tọa độ hạt phải là số nguyên')
  }
  const beads = design.beads.filter((item) => item.x !== bead.x || item.y !== bead.y)
  beads.push({ x: bead.x, y: bead.y, color })
  return {
    ...design,
    beads: sortBeads(beads),
    updatedAt: new Date().toISOString(),
  }
}

export function removeBead(design: Design, x: number, y: number): Design {
  const beads = design.beads.filter((bead) => bead.x !== x || bead.y !== y)
  if (beads.length === design.beads.length) {
    return design
  }
  return {
    ...design,
    beads,
    updatedAt: new Date().toISOString(),
  }
}

export function parseDesignJson(text: string): Design {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Tệp JSON không hợp lệ')
  }
  return normalizeDesign(parsed)
}

export function serializeDesignJson(design: Design): string {
  return `${JSON.stringify(normalizeDesign(design), null, 2)}\n`
}
