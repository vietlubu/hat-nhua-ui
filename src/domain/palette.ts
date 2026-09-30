export interface PaletteColor {
  id: string
  label: string
  hex: string
}

export const PALETTE: PaletteColor[] = [
  { id: 'white', label: 'Trắng', hex: '#FFFFFF' },
  { id: 'black', label: 'Đen', hex: '#1A1A1A' },
  { id: 'red', label: 'Đỏ', hex: '#E53935' },
  { id: 'orange', label: 'Cam', hex: '#FB8C00' },
  { id: 'yellow', label: 'Vàng', hex: '#FDD835' },
  { id: 'green', label: 'Xanh lá', hex: '#43A047' },
  { id: 'teal', label: 'Xanh ngọc', hex: '#00ACC1' },
  { id: 'blue', label: 'Xanh dương', hex: '#1E88E5' },
  { id: 'indigo', label: 'Xanh tím', hex: '#3949AB' },
  { id: 'purple', label: 'Tím', hex: '#8E24AA' },
  { id: 'pink', label: 'Hồng', hex: '#D81B60' },
  { id: 'brown', label: 'Nâu', hex: '#6D4C41' },
  { id: 'gray', label: 'Xám', hex: '#757575' },
  { id: 'light-gray', label: 'Xám nhạt', hex: '#D7D7D7' },
  { id: 'skin', label: 'Kem da', hex: '#FFCC80' },
  { id: 'light-blue', label: 'Xanh nhạt', hex: '#90CAF9' },
]

export const PALETTE_STORAGE_KEY = 'perler-bead-designer:palette:v1'

// WCAG relative luminance threshold: below it, white text has the higher contrast ratio.
export function contrastTextColor(hex: string): string {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16))
  return luminance < 0.179 ? '#FFFFFF' : '#000000'
}

export function loadPalette(): { colors: PaletteColor[]; error?: string } {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (raw === null) return { colors: [...PALETTE] }
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.some((hex) => typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex))) {
      throw new Error('Bảng màu không hợp lệ')
    }
    const colors = [...new Set(value.map((hex: string) => hex.toUpperCase()))].map((hex) =>
      PALETTE.find((color) => color.hex === hex) ?? { id: hex, label: hex, hex },
    )
    return { colors }
  } catch {
    return { colors: [...PALETTE], error: 'Không đọc được bảng màu đã lưu' }
  }
}

export function savePalette(colors: PaletteColor[]): void {
  localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(colors.map((color) => color.hex)))
}
