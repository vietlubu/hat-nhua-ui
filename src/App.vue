<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BoardCanvas, { type BoardTool } from './components/BoardCanvas.vue'
import Icon from './components/Icon.vue'
import PreviewCanvas from './components/PreviewCanvas.vue'
import { contrastTextColor, loadPalette, PALETTE, savePalette } from './domain/palette'
import {
  createEmptyDesign,
  parseDesignJson,
  serializeDesignJson,
  type Design,
  type DesignLibrary,
} from './domain/design'
import {
  designById,
  loadLibraryWithStatus,
  saveLibrary,
} from './domain/storage'
import { renderPreviewToPng } from './render/ironPreview'

const loaded = loadLibraryWithStatus()
const library = ref<DesignLibrary>(loaded.library)
const initialDesign = designById(loaded.library, loaded.library.currentId) ?? createEmptyDesign('Thiết kế mới')
if (library.value.designs.length === 0) {
  library.value = { version: 1, currentId: initialDesign.id, designs: [initialDesign] }
}

const currentDesign = ref<Design>(initialDesign)
const loadedPalette = loadPalette()
const palette = ref(loadedPalette.colors)
const selectedColor = ref(palette.value.find((color) => color.hex === '#E53935')?.hex ?? palette.value[0]?.hex ?? '')
const newColor = ref('#E53935')
const tool = ref<BoardTool>(palette.value.length ? 'pencil' : 'pan')
const nameDraft = ref(currentDesign.value.name)
const importInput = ref<HTMLInputElement | null>(null)
const toast = ref([loaded.error, loadedPalette.error].filter(Boolean).join('. '))
const saveStatus = ref<'saved' | 'pending' | 'error'>('saved')
const activeTab = ref<'palette' | 'preview' | 'library'>('palette')
const hoverCell = ref<{ x: number; y: number } | null>(null)
const previewMode = ref<'fit' | 'actual'>('fit')
// History stack for Undo / Redo
const history = ref<Design[]>([initialDesign])
const historyIndex = ref(0)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

let saveTimer: number | undefined
let toastTimer: number | undefined
let previousTool: BoardTool | null = null

const sortedDesigns = computed(() => [...library.value.designs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))

const beadCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const bead of currentDesign.value.beads) counts.set(bead.color, (counts.get(bead.color) ?? 0) + 1)
  return counts
})

const designBounds = computed(() => {
  const beads = currentDesign.value.beads
  if (!beads.length) {
    return { width: 0, height: 0, widthCm: '0', heightCm: '0', count: 0, colors: 0 }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const bead of beads) {
    if (bead.x < minX) minX = bead.x
    if (bead.x > maxX) maxX = bead.x
    if (bead.y < minY) minY = bead.y
    if (bead.y > maxY) maxY = bead.y
  }
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  return {
    width,
    height,
    widthCm: (width * 0.5).toFixed(1),
    heightCm: (height * 0.5).toFixed(1),
    count: beads.length,
    colors: beadCounts.value.size,
  }
})

function setToast(message: string): void {
  toast.value = message
  window.clearTimeout(toastTimer)
  if (message) {
    toastTimer = window.setTimeout(() => {
      toast.value = ''
    }, 3500)
  }
}

function persistPalette(): void {
  try {
    savePalette(palette.value)
  } catch {
    setToast('Không lưu được bảng màu. Các thay đổi chỉ giữ trong phiên này.')
  }
}

function addColor(): void {
  const hex = newColor.value.toUpperCase()
  if (!/^#[0-9A-F]{6}$/.test(hex)) return
  if (!palette.value.some((color) => color.hex === hex)) {
    palette.value.push({ id: hex, label: hex, hex })
  }
  selectedColor.value = hex
  tool.value = 'pencil'
  persistPalette()
}

function deleteColor(): void {
  palette.value = palette.value.filter((color) => color.hex !== selectedColor.value)
  selectedColor.value = palette.value[0]?.hex ?? ''
  if (!palette.value.length && tool.value === 'pencil') tool.value = 'pan'
  persistPalette()
}

function resetDefaultPalette(): void {
  palette.value = [...PALETTE]
  selectedColor.value = palette.value.find((c) => c.hex === '#E53935')?.hex ?? palette.value[0]?.hex ?? ''
  persistPalette()
  setToast('Đã khôi phục bảng màu chuẩn (16 màu)')
}

function pushHistory(design: Design): void {
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(design)
  if (history.value.length > 50) history.value.shift()
  historyIndex.value = history.value.length - 1
}

function undo(): void {
  if (!canUndo.value) return
  historyIndex.value -= 1
  const target = history.value[historyIndex.value]
  currentDesign.value = target
  library.value = libraryWithCurrent(target)
  schedulePersist()
  setToast('Đã hoàn tác')
}

function redo(): void {
  if (!canRedo.value) return
  historyIndex.value += 1
  const target = history.value[historyIndex.value]
  currentDesign.value = target
  library.value = libraryWithCurrent(target)
  schedulePersist()
  setToast('Đã làm lại')
}

function libraryWithCurrent(design: Design): DesignLibrary {
  return {
    version: 1,
    currentId: design.id,
    designs: library.value.designs.map((item) => item.id === design.id ? design : item),
  }
}

function persistNow(showSaved = false): void {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer)
    saveTimer = undefined
  }
  try {
    saveLibrary(library.value)
    saveStatus.value = 'saved'
    if (showSaved) setToast('Đã lưu thiết kế')
  } catch (error) {
    saveStatus.value = 'error'
    setToast(error instanceof DOMException && error.name === 'QuotaExceededError'
      ? 'Bộ nhớ trình duyệt đã đầy'
      : 'Trình duyệt không cho phép lưu. Hãy xuất JSON để giữ thiết kế.')
  }
}

function schedulePersist(): void {
  saveStatus.value = 'pending'
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => persistNow(), 300)
}

function replaceCurrent(design: Design, record = true): void {
  currentDesign.value = design
  library.value = libraryWithCurrent(design)
  if (record) pushHistory(design)
  schedulePersist()
}

function createDesign(): void {
  const design = createEmptyDesign(`Thiết kế ${library.value.designs.length + 1}`)
  library.value = {
    version: 1,
    currentId: design.id,
    designs: [...library.value.designs, design],
  }
  currentDesign.value = design
  nameDraft.value = design.name
  history.value = [design]
  historyIndex.value = 0
  schedulePersist()
  setToast('Đã tạo thiết kế mới')
}

function openDesign(design: Design): void {
  currentDesign.value = design
  library.value = { ...library.value, currentId: design.id }
  nameDraft.value = design.name
  history.value = [design]
  historyIndex.value = 0
  schedulePersist()
}

function renameCurrent(): void {
  const name = nameDraft.value.trim() || 'Thiết kế không tên'
  nameDraft.value = name
  replaceCurrent({ ...currentDesign.value, name, updatedAt: new Date().toISOString() }, false)
}

function deleteCurrent(): void {
  if (!window.confirm(`Xóa “${currentDesign.value.name}”?`)) return
  const remaining = library.value.designs.filter((design) => design.id !== currentDesign.value.id)
  if (remaining.length === 0) {
    const blank = createEmptyDesign('Thiết kế mới')
    library.value = { version: 1, currentId: blank.id, designs: [blank] }
    currentDesign.value = blank
    nameDraft.value = blank.name
    history.value = [blank]
    historyIndex.value = 0
    schedulePersist()
    return
  }
  const next = [...remaining].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  library.value = { version: 1, currentId: next.id, designs: remaining }
  currentDesign.value = next
  nameDraft.value = next.name
  history.value = [next]
  historyIndex.value = 0
  schedulePersist()
}

function clearCurrentDesign(): void {
  if (!currentDesign.value.beads.length) return
  if (!window.confirm(`Xóa toàn bộ ${currentDesign.value.beads.length} hạt trên khung vẽ hiện tại?`)) return
  replaceCurrent({ ...currentDesign.value, beads: [], updatedAt: new Date().toISOString() })
  setToast('Đã xóa sạch khung vẽ')
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9À-ỹ _-]/g, '').replace(/\s+/g, '-') || 'thiet-ke-hat-nhua'
}

function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportJson(): void {
  const blob = new Blob([serializeDesignJson(currentDesign.value)], { type: 'application/json;charset=utf-8' })
  downloadFile(blob, `${sanitizeFilename(currentDesign.value.name)}.json`)
  setToast('Đã xuất JSON')
}

async function exportPng(): Promise<void> {
  try {
    const blob = await renderPreviewToPng(currentDesign.value)
    downloadFile(blob, `${sanitizeFilename(currentDesign.value.name)}.png`)
    setToast('Đã xuất ảnh PNG chất lượng cao')
  } catch {
    setToast('Không thể tạo ảnh PNG')
  }
}

function selectImportFile(): void {
  importInput.value?.click()
}

async function importJson(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const parsed = parseDesignJson(await file.text())
    const imported: Design = {
      ...createEmptyDesign(parsed.name),
      beads: parsed.beads,
    }
    library.value = {
      version: 1,
      currentId: imported.id,
      designs: [...library.value.designs, imported],
    }
    currentDesign.value = imported
    nameDraft.value = imported.name
    history.value = [imported]
    historyIndex.value = 0
    schedulePersist()
    setToast('Đã nhập thiết kế mới')
  } catch (error) {
    setToast(error instanceof Error ? error.message : 'Không thể nhập JSON')
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function handlePwaMessage(event: Event): void {
  setToast(event.type === 'pwa:offline-ready' ? 'Ứng dụng đã sẵn sàng dùng offline' : 'Phiên bản mới đã sẵn sàng')
}

watch(currentDesign, (design) => {
  nameDraft.value = design.name
})

function flushPendingSave(): void {
  if (saveStatus.value === 'pending') persistNow()
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushPendingSave()
}

const TOOL_KEYS: Record<string, BoardTool> = { b: 'pencil', e: 'eraser', h: 'pan' }

function handleKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      persistNow(true)
      return
    }
  }

  const target = event.target as HTMLElement | null
  if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

  if (event.code === 'Space' && !event.repeat && tool.value !== 'pan') {
    event.preventDefault()
    previousTool = tool.value
    tool.value = 'pan'
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey) return
  const nextTool = TOOL_KEYS[event.key.toLowerCase()]
  if (!nextTool) return
  event.preventDefault()
  if (nextTool === 'pencil' && !palette.value.length) return
  tool.value = nextTool
}

function handleKeyup(event: KeyboardEvent): void {
  if (event.code === 'Space' && previousTool) {
    tool.value = previousTool
    previousTool = null
  }
}

onMounted(() => {
  window.addEventListener('pwa:offline-ready', handlePwaMessage)
  window.addEventListener('pwa:update-ready', handlePwaMessage)
  window.addEventListener('pagehide', flushPendingSave)
  window.addEventListener('beforeunload', flushPendingSave)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  if (!loaded.error) schedulePersist()
})

onBeforeUnmount(() => {
  flushPendingSave()
  window.removeEventListener('pwa:offline-ready', handlePwaMessage)
  window.removeEventListener('pwa:update-ready', handlePwaMessage)
  window.removeEventListener('pagehide', flushPendingSave)
  window.removeEventListener('beforeunload', flushPendingSave)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app-shell">
    <!-- Topbar: App header & main actions -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"><Icon name="bead" /></span>
          <div class="brand-text">
            <span class="brand-name">Hạt Nhựa Studio</span>
            <span class="brand-badge">PRO</span>
          </div>
        </div>

        <div class="doc">
          <div class="doc-input-wrap">
            <input
              id="design-name"
              v-model="nameDraft"
              class="doc-name"
              aria-label="Tên thiết kế"
              title="Nhấp để đổi tên bản vẽ"
              spellcheck="false"
              @change="renameCurrent"
              @keyup.enter="renameCurrent"
            >
          </div>
          <span class="save-state" :class="`is-${saveStatus}`" :title="saveStatus === 'pending' ? 'Đang lưu tự động…' : saveStatus === 'error' ? 'Lỗi khi lưu bộ nhớ' : 'Bản vẽ đã được lưu tự động'">
            {{ saveStatus === 'pending' ? 'Đang lưu…' : saveStatus === 'error' ? 'Chưa lưu' : 'Đã lưu' }}
          </span>
        </div>
      </div>

      <div class="topbar-center">
        <!-- Quick History Undo/Redo -->
        <div class="btn-group" role="group" aria-label="Lịch sử chỉnh sửa">
          <button
            class="btn btn-icon"
            type="button"
            :disabled="!canUndo"
            title="Hoàn tác (Ctrl+Z)"
            aria-label="Hoàn tác"
            @click="undo"
          >
            <Icon name="undo" />
          </button>
          <button
            class="btn btn-icon"
            type="button"
            :disabled="!canRedo"
            title="Làm lại (Ctrl+Shift+Z)"
            aria-label="Làm lại"
            @click="redo"
          >
            <Icon name="redo" />
          </button>
        </div>
      </div>

      <div class="topbar-right">
        <div class="toolbar">
          <button class="btn" type="button" title="Tạo bản vẽ mới" @click="createDesign">
            <Icon name="file-plus" />
            <span class="btn-label">Mới</span>
          </button>
          <button class="btn" type="button" title="Lưu ngay lập tức (Ctrl+S)" @click="persistNow(true)">
            <Icon name="save" />
            <span class="btn-label">Lưu</span>
          </button>
          <span class="toolbar-divider" aria-hidden="true" />
          <button class="btn" type="button" title="Mở file thiết kế từ máy tính" @click="selectImportFile">
            <Icon name="upload" />
            <span class="btn-label">Nhập JSON</span>
          </button>
          <button class="btn" type="button" title="Lưu tệp dữ liệu JSON" @click="exportJson">
            <Icon name="code" />
            <span class="btn-label">Xuất JSON</span>
          </button>
          <button class="btn btn-primary" type="button" title="Xuất file ảnh hạt ủi độ phân giải cao" @click="exportPng">
            <Icon name="image" />
            <span class="btn-label">Xuất PNG</span>
          </button>
          <input ref="importInput" class="visually-hidden" type="file" aria-label="Chọn tệp thiết kế JSON" accept="application/json,.json" @change="importJson">
        </div>
      </div>
    </header>

    <!-- Workspace: Tool Rail + Central Stage + Inspector Dock -->
    <main class="workspace">
      <!-- Left Rail: Drawing Tools -->
      <nav class="rail" aria-label="Hộp công cụ vẽ">
        <div class="rail-group">
          <button
            :class="['rail-btn', { active: tool === 'pencil' }]"
            :disabled="!palette.length"
            :aria-pressed="tool === 'pencil'"
            type="button"
            title="Bút vẽ hạt (Phím B) — Đặt hạt vào ô"
            @click="tool = 'pencil'"
          >
            <Icon name="pencil" />
            <span class="rail-label">Bút</span>
            <kbd>B</kbd>
          </button>

          <button
            :class="['rail-btn', { active: tool === 'eraser' }]"
            :aria-pressed="tool === 'eraser'"
            type="button"
            title="Tẩy xóa (Phím E) — Gỡ hạt khỏi ô"
            @click="tool = 'eraser'"
          >
            <Icon name="eraser" />
            <span class="rail-label">Tẩy</span>
            <kbd>E</kbd>
          </button>

          <button
            :class="['rail-btn', { active: tool === 'pan' }]"
            :aria-pressed="tool === 'pan'"
            type="button"
            title="Di chuyển khung hình (Phím H hoặc giữ Space)"
            @click="tool = 'pan'"
          >
            <Icon name="hand" />
            <span class="rail-label">Rê khung</span>
            <kbd>H</kbd>
          </button>
        </div>

        <div class="rail-divider" aria-hidden="true" />

        <!-- Current Color Pip in Rail (Drawing App Signature) -->
        <div class="rail-color-box">
          <button
            class="rail-color-btn"
            type="button"
            :style="{ '--active-color': selectedColor || '#999' }"
            :title="`Màu đang chọn: ${selectedColor} (Nhấp để mở bảng màu)`"
            @click="tool = 'pencil'; activeTab = 'palette'"
          >
            <span class="rail-color-bead" />
          </button>
          <span class="rail-label">Màu vẽ</span>
        </div>

        <div class="rail-divider" aria-hidden="true" />

        <!-- Clear Board Tool -->
        <button
          class="rail-btn rail-btn-danger"
          type="button"
          :disabled="!currentDesign.beads.length"
          title="Xóa toàn bộ hạt trên khung"
          aria-label="Xóa sạch khung vẽ"
          @click="clearCurrentDesign"
        >
          <Icon name="clear" />
          <span class="rail-label">Xóa hết</span>
        </button>
      </nav>

      <!-- Center Stage: Drawing Board -->
      <section class="stage" aria-label="Bàn vẽ hạt nhựa">
        <!-- Floating Canvas Meta Overlay (Studio CAD Style) -->
        <div class="canvas-meta-bar" aria-hidden="true">
          <div class="meta-pill">
            <span class="meta-dot" :style="{ backgroundColor: selectedColor || 'var(--accent)' }" />
            <span class="meta-text">{{ currentDesign.beads.length }} hạt</span>
          </div>
          <div class="meta-pill">
            <span class="meta-text">{{ beadCounts.size }} màu</span>
          </div>
          <div class="meta-pill meta-coord">
            <span class="meta-text">{{ hoverCell ? `X: ${hoverCell.x}, Y: ${hoverCell.y}` : 'Tâm (0, 0)' }}</span>
          </div>
        </div>

        <!-- The Canvas Surface -->
        <BoardCanvas
          :key="currentDesign.id"
          :design="currentDesign"
          :selected-color="selectedColor"
          :tool="tool"
          @update:design="replaceCurrent"
          @hover:cell="(cell) => hoverCell = cell"
        />
      </section>

      <!-- Right Inspector: Tabbed Studio Panels -->
      <aside class="inspector" aria-label="Bảng điều khiển và thuộc tính">
        <!-- Inspector Segmented Navigation Tabs -->
        <div class="inspector-tabs" role="tablist" aria-label="Chuyển chế độ xem bên phải">
          <button
            :class="['inspector-tab', { active: activeTab === 'palette' }]"
            role="tab"
            :aria-selected="activeTab === 'palette'"
            type="button"
            @click="activeTab = 'palette'"
          >
            <Icon name="palette" />
            <span>Màu sắc</span>
          </button>
          <button
            :class="['inspector-tab', { active: activeTab === 'preview' }]"
            role="tab"
            :aria-selected="activeTab === 'preview'"
            type="button"
            @click="activeTab = 'preview'"
          >
            <Icon name="sparkles" />
            <span>Xem trước</span>
          </button>
          <button
            :class="['inspector-tab', { active: activeTab === 'library' }]"
            role="tab"
            :aria-selected="activeTab === 'library'"
            type="button"
            @click="activeTab = 'library'"
          >
            <Icon name="folder" />
            <span>Thư viện</span>
            <span class="tab-badge">{{ sortedDesigns.length }}</span>
          </button>
        </div>

        <!-- Panel 1: Palette & Swatches -->
        <div v-show="activeTab === 'palette'" class="inspector-content">
          <!-- Active Color Hero Card -->
          <div class="color-hero-card">
            <div class="hero-bead-wrap">
              <div class="bead-3d" :style="{ '--bead-color': selectedColor || '#999' }" />
            </div>
            <div class="hero-color-info">
              <div class="hero-color-hex">{{ selectedColor || 'Chưa chọn màu' }}</div>
              <div class="hero-color-usage">
                <strong>{{ beadCounts.get(selectedColor) ?? 0 }}</strong> hạt đang dùng
              </div>
            </div>
          </div>

          <!-- Color Swatches Grid -->
          <div class="panel-section">
            <div class="section-head">
              <h3>Bảng màu hạt</h3>
              <span class="section-tag">{{ palette.length }} màu</span>
            </div>

            <div class="swatches" role="group" aria-label="Danh sách hạt màu">
              <button
                v-for="color in palette"
                :key="color.id"
                :class="['swatch', { active: selectedColor === color.hex }]"
                :style="{ '--bead-color': color.hex }"
                type="button"
                :aria-label="`${color.label} (${color.hex}) — ${beadCounts.get(color.hex) ?? 0} hạt`"
                :aria-pressed="selectedColor === color.hex"
                :title="`${color.label} (${color.hex}) — ${beadCounts.get(color.hex) ?? 0} hạt`"
                @click="selectedColor = color.hex; tool = 'pencil'"
              >
                <span class="swatch-bead">
                  <span class="bead-hole" />
                  <span class="swatch-count" :style="{ color: contrastTextColor(color.hex) }">
                    {{ beadCounts.get(color.hex) ?? '' }}
                  </span>
                </span>
              </button>
            </div>
          </div>

          <!-- Color Customizer & Tools -->
          <div class="panel-section">
            <div class="section-head">
              <h3>Thêm & Quản lý màu</h3>
            </div>
            <form class="palette-tools" @submit.prevent="addColor">
              <div class="color-picker-row">
                <div class="color-input-bubble" :style="{ backgroundColor: newColor }">
                  <input id="new-color" v-model="newColor" type="color" aria-label="Chọn màu mới">
                </div>
                <input
                  v-model="newColor"
                  class="color-hex-input"
                  type="text"
                  maxlength="7"
                  placeholder="#RRGGBB"
                  aria-label="Mã màu HEX"
                >
                <button class="btn btn-sm btn-primary" type="submit">
                  <Icon name="plus" />Thêm
                </button>
              </div>

              <div class="palette-actions-row">
                <button
                  class="btn btn-sm btn-danger"
                  type="button"
                  :disabled="!palette.length"
                  title="Xóa màu đang chọn khỏi bảng màu"
                  @click="deleteColor"
                >
                  <Icon name="trash" />Xóa màu chọn
                </button>
                <button
                  class="btn btn-sm btn-subtle"
                  type="button"
                  title="Khôi phục 16 màu tiêu chuẩn"
                  @click="resetDefaultPalette"
                >
                  Mặc định
                </button>
              </div>
            </form>
          </div>

          <!-- Mini Live Ironed Preview Card -->
          <div class="panel-section mini-preview-card">
            <div class="section-head">
              <h3>Xem nhanh sau khi ủi</h3>
              <button class="btn btn-link" type="button" @click="activeTab = 'preview'">Mở to →</button>
            </div>
            <div class="mini-preview-frame" @click="activeTab = 'preview'">
              <PreviewCanvas :design="currentDesign" />
            </div>
          </div>
        </div>

        <!-- Panel 2: Realistic Ironed Preview -->
        <div v-show="activeTab === 'preview'" class="inspector-content">
          <div class="panel-section">
            <div class="section-head">
              <h3>Mô phỏng thành phẩm</h3>
              <div class="preview-mode-switch" role="group" aria-label="Chế độ hiển thị xem trước">
                <button
                  :class="['preview-mode-btn', { active: previewMode === 'fit' }]"
                  type="button"
                  title="Tự động thu nhỏ để hiển thị trọn vẹn toàn bộ hình vẽ"
                  @click="previewMode = 'fit'"
                >
                  Vừa khung
                </button>
                <button
                  :class="['preview-mode-btn', { active: previewMode === 'actual' }]"
                  type="button"
                  title="Hiển thị theo kích thước gốc và cho phép cuộn"
                  @click="previewMode = 'actual'"
                >
                  100%
                </button>
              </div>
            </div>

            <div :class="['preview-hero-frame', `is-${previewMode}`]">
              <PreviewCanvas :design="currentDesign" />
            </div>

            <!-- Specs Grid -->
            <div class="specs-grid">
              <div class="spec-card">
                <span class="spec-label">Tổng số hạt</span>
                <span class="spec-value">{{ designBounds.count }}</span>
              </div>
              <div class="spec-card">
                <span class="spec-label">Số màu dùng</span>
                <span class="spec-value">{{ designBounds.colors }}</span>
              </div>
              <div class="spec-card">
                <span class="spec-label">Khổ hạt (W × H)</span>
                <span class="spec-value">{{ designBounds.width }} × {{ designBounds.height }}</span>
              </div>
              <div class="spec-card">
                <span class="spec-label">Kích thước thật</span>
                <span class="spec-value">{{ designBounds.widthCm }} × {{ designBounds.heightCm }} cm</span>
              </div>
            </div>

            <div class="info-tip">
              <p>Hiệu ứng ủi: Hạt liền kề nóng chảy liên kết dính viền lại với nhau; lỗ giữa co nhỏ lại như sản phẩm thực tế.</p>
            </div>

            <button class="btn btn-primary btn-block" type="button" @click="exportPng">
              <Icon name="image" />Tải ảnh PNG (Độ phân giải cao)
            </button>
          </div>
        </div>

        <!-- Panel 3: Saved Library / Project Manager -->
        <div v-show="activeTab === 'library'" class="inspector-content">
          <div class="panel-section">
            <div class="section-head">
              <h3>Bộ sưu tập thiết kế</h3>
              <button class="btn btn-sm btn-primary" type="button" @click="createDesign">
                <Icon name="plus" />Bản vẽ mới
              </button>
            </div>

            <ul class="design-list">
              <li v-for="design in sortedDesigns" :key="design.id">
                <button
                  :class="['design-item', { active: design.id === currentDesign.id }]"
                  type="button"
                  @click="openDesign(design)"
                >
                  <span class="design-color-dots" aria-hidden="true">
                    <i
                      v-for="(color, idx) in design.beads.slice(0, 4)"
                      :key="`${design.id}-${color.x}-${color.y}-${idx}`"
                      :style="{ backgroundColor: color.color }"
                    />
                  </span>
                  <span class="design-item-copy">
                    <span class="design-item-title">
                      <strong>{{ design.name }}</strong>
                      <span v-if="design.id === currentDesign.id" class="badge-active">Đang mở</span>
                    </span>
                    <small>{{ design.beads.length }} hạt · {{ formatDate(design.updatedAt) }}</small>
                  </span>
                </button>
              </li>
            </ul>

            <div class="library-footer">
              <button class="btn btn-sm btn-danger btn-block" type="button" @click="deleteCurrent">
                <Icon name="trash" />Xóa thiết kế đang mở
              </button>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Bottom Studio Status Bar -->
    <footer class="statusbar">
      <div class="status-left">
        <span class="status-indicator" :class="`is-${tool}`" />
        <span class="status-tip">
          <template v-if="tool === 'pencil'">Bút vẽ [B]: Nhấp hoặc kéo chuột trên khung để cắm hạt</template>
          <template v-else-if="tool === 'eraser'">Tẩy xóa [E]: Nhấp hoặc kéo chuột trên hạt để gỡ hạt</template>
          <template v-else-if="tool === 'pan'">Di chuyển [H]: Kéo chuột để dịch chuyển khung vẽ (hoặc giữ phím Space)</template>
        </span>
      </div>

      <div class="status-center">
        <span class="shortcut-tip">Phím tắt: B: Bút · E: Tẩy · H/Space: Rê khung · Cuộn chuột: Phóng to/Thu nhỏ · Ctrl+Z: Hoàn tác</span>
      </div>

      <div class="status-right">
        <span class="status-cell-info">
          {{ hoverCell ? `Ô: (${hoverCell.x}, ${hoverCell.y})` : 'Tâm: (0, 0)' }}
        </span>
        <span class="status-divider" />
        <span class="status-color-info" :style="{ '--color-dot': selectedColor || 'transparent' }">
          <span class="status-color-dot" />
          {{ selectedColor || 'Không có màu' }}
        </span>
      </div>
    </footer>

    <!-- Notification Toast -->
    <p v-if="toast" class="toast" role="status">{{ toast }}</p>
  </div>
</template>
