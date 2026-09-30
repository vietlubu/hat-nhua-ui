import {
  createEmptyDesign,
  normalizeDesign,
  type Design,
  type DesignLibrary,
} from './design'

export const LIBRARY_STORAGE_KEY = 'perler-bead-designer:library:v1'

export interface LibraryLoadResult {
  library: DesignLibrary
  error?: string
}

function defaultLibrary(): DesignLibrary {
  const design = createEmptyDesign('Thiết kế mới')
  return { version: 1, currentId: design.id, designs: [design] }
}


export function normalizeLibrary(input: unknown): DesignLibrary {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Dữ liệu thư viện không hợp lệ')
  }
  const value = input as Record<string, unknown>
  if (value.version !== 1 || !Array.isArray(value.designs)) {
    throw new Error('Dữ liệu thư viện không hợp lệ')
  }
  if (value.currentId !== null && typeof value.currentId !== 'string') {
    throw new Error('Thiếu thiết kế đang mở')
  }

  const designs = value.designs.map((design) => normalizeDesign(design))
  const ids = new Set<string>()
  for (const design of designs) {
    if (ids.has(design.id)) {
      throw new Error('Thư viện có id trùng nhau')
    }
    ids.add(design.id)
  }
  if (designs.length > 0 && (value.currentId === null || !ids.has(value.currentId))) {
    throw new Error('Thiết kế đang mở không tồn tại')
  }
  if (designs.length === 0 && value.currentId !== null) {
    throw new Error('Thư viện rỗng nhưng vẫn có thiết kế đang mở')
  }

  return { version: 1, currentId: value.currentId, designs }
}

export function loadLibraryWithStatus(): LibraryLoadResult {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
    if (!raw) {
      return { library: defaultLibrary() }
    }
    const library = normalizeLibrary(JSON.parse(raw))
    return { library: library.designs.length ? library : defaultLibrary() }
  } catch {
    return {
      library: defaultLibrary(),
      error: 'Không đọc được dữ liệu cũ',
    }
  }
}

export function loadLibrary(): DesignLibrary {
  return loadLibraryWithStatus().library
}

export function saveLibrary(library: DesignLibrary): void {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(normalizeLibrary(library)))
}


export function designById(library: DesignLibrary, id: string | null): Design | undefined {
  return library.designs.find((design) => design.id === id)
}
