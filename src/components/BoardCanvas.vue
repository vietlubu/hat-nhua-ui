<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  BASE_CELL_PX,
  cellsAlongSegment,
  clampZoom,
  screenToWorld,
  type Cell,
  type Point,
  type Viewport,
  worldToScreen,
} from '../domain/board'
import { removeBead, upsertBead, type Design } from '../domain/design'

export type BoardTool = 'pencil' | 'eraser' | 'pan'

type Props = {
  design: Design
  selectedColor: string
  tool: BoardTool
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:design': [design: Design]
  'update:viewport': [viewport: Viewport]
  'hover:cell': [cell: Cell | null]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const container = ref<HTMLDivElement | null>(null)
const viewport = ref<Viewport>({ offsetX: 0, offsetY: 0, zoom: 1 })
const canvasSize = ref({ width: 0, height: 0, dpr: 1 })
let resizeObserver: ResizeObserver | undefined
let renderFrame = 0
let workingDesign = props.design

interface PointerState {
  point: Point
  start: Point
}

interface PinchState {
  startDistance: number
  startViewport: Viewport
  focusWorld: Point
}

const pointers = new Map<number, PointerState>()
let primaryPointerId: number | undefined
let pendingPoint: Point | undefined
let lastCell: Cell | undefined
let drawing = false
let pinch: PinchState | undefined

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function scheduleRender(): void {
  if (renderFrame) return
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0
    render()
  })
}

function resizeCanvas(): void {
  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const previous = canvasSize.value
  if (previous.width === rect.width && previous.height === rect.height && previous.dpr === dpr) return
  canvasSize.value = { width: rect.width, height: rect.height, dpr }
  element.width = Math.max(1, Math.round(rect.width * dpr))
  element.height = Math.max(1, Math.round(rect.height * dpr))
  scheduleRender()
}

function beadMap(): Map<string, string> {
  return new Map(props.design.beads.map((bead) => [`${bead.x},${bead.y}`, bead.color]))
}

function render(): void {
  const element = canvas.value
  if (!element || canvasSize.value.width === 0 || canvasSize.value.height === 0) return
  const { width, height, dpr } = canvasSize.value
  const ctx = element.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#fbfbfd'
  ctx.fillRect(0, 0, width, height)

  const cellSize = BASE_CELL_PX * viewport.value.zoom
  const minX = Math.floor((-width / 2 - viewport.value.offsetX) / cellSize) - 1
  const maxX = Math.ceil((width / 2 - viewport.value.offsetX) / cellSize) + 1
  const minY = Math.floor((-height / 2 - viewport.value.offsetY) / cellSize) - 1
  const maxY = Math.ceil((height / 2 - viewport.value.offsetY) / cellSize) + 1
  const beads = beadMap()

  ctx.lineWidth = 1
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const center = worldToScreen({ x, y }, viewport.value, width, height, BASE_CELL_PX)
      const left = center.x - cellSize / 2
      const top = center.y - cellSize / 2
      const color = beads.get(`${x},${y}`)

      ctx.strokeStyle = color ? 'rgba(18, 21, 27, 0.16)' : 'rgba(18, 21, 27, 0.07)'
      ctx.strokeRect(left, top, cellSize, cellSize)
      if (!color) {
        ctx.beginPath()
        ctx.fillStyle = 'rgba(18, 21, 27, 0.14)'
        ctx.arc(center.x, center.y, Math.max(1.5, cellSize * 0.08), 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      const beadSize = cellSize * 0.8
      const inset = (cellSize - beadSize) / 2
      roundedRect(ctx, left + inset, top + inset, beadSize, beadSize, beadSize * 0.25)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(18, 21, 27, 0.24)'
      ctx.stroke()
      ctx.beginPath()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)'
      ctx.arc(center.x - beadSize * 0.18, center.y - beadSize * 0.18, Math.max(1.5, beadSize * 0.08), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const origin = worldToScreen({ x: 0, y: 0 }, viewport.value, width, height, BASE_CELL_PX)
  ctx.strokeStyle = 'rgba(77, 141, 255, 0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(origin.x, 0)
  ctx.lineTo(origin.x, height)
  ctx.moveTo(0, origin.y)
  ctx.lineTo(width, origin.y)
  ctx.stroke()
}

function localPoint(event: PointerEvent | WheelEvent): Point {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function worldPoint(point: Point): Point {
  const size = BASE_CELL_PX * viewport.value.zoom
  return {
    x: (point.x - canvasSize.value.width / 2 - viewport.value.offsetX) / size,
    y: (point.y - canvasSize.value.height / 2 - viewport.value.offsetY) / size,
  }
}

function setViewport(next: Viewport): void {
  viewport.value = { ...next, zoom: clampZoom(next.zoom) }
  emit('update:viewport', viewport.value)
  scheduleRender()
}

function zoomAt(point: Point, zoom: number): void {
  const focus = worldPoint(point)
  const nextZoom = clampZoom(zoom)
  const nextSize = BASE_CELL_PX * nextZoom
  setViewport({
    zoom: nextZoom,
    offsetX: point.x - canvasSize.value.width / 2 - focus.x * nextSize,
    offsetY: point.y - canvasSize.value.height / 2 - focus.y * nextSize,
  })
}

function zoomBy(factor: number): void {
  zoomAt(
    { x: canvasSize.value.width / 2, y: canvasSize.value.height / 2 },
    viewport.value.zoom * factor,
  )
}

function resetViewport(): void {
  setViewport({ offsetX: 0, offsetY: 0, zoom: 1 })
}

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function startPinch(): void {
  const active = [...pointers.values()]
  const first = active[0]
  const second = active[1]
  if (!first || !second) return
  const middle = midpoint(first.point, second.point)
  pinch = {
    startDistance: Math.max(1, distance(first.point, second.point)),
    startViewport: { ...viewport.value },
    focusWorld: worldPoint(middle),
  }
  pendingPoint = undefined
  drawing = false
  lastCell = undefined
}

function updatePinch(): void {
  if (!pinch) return
  const active = [...pointers.values()]
  const first = active[0]
  const second = active[1]
  if (!first || !second) return
  const middle = midpoint(first.point, second.point)
  const nextZoom = clampZoom(
    pinch.startViewport.zoom * (distance(first.point, second.point) / pinch.startDistance),
  )
  const size = BASE_CELL_PX * nextZoom
  setViewport({
    zoom: nextZoom,
    offsetX: middle.x - canvasSize.value.width / 2 - pinch.focusWorld.x * size,
    offsetY: middle.y - canvasSize.value.height / 2 - pinch.focusWorld.y * size,
  })
}

function updateDesignAtCells(cells: Cell[]): void {
  let next = workingDesign
  for (const cell of cells) {
    next = props.tool === 'eraser'
      ? removeBead(next, cell.x, cell.y)
      : upsertBead(next, { x: cell.x, y: cell.y, color: props.selectedColor })
  }
  if (next !== workingDesign) {
    workingDesign = next
    emit('update:design', next)
  }
}

function paintAt(point: Point): void {
  const cell = screenToWorld(point, viewport.value, canvasSize.value.width, canvasSize.value.height, BASE_CELL_PX)
  const cells = lastCell ? cellsAlongSegment(lastCell, cell) : [cell]
  updateDesignAtCells(cells)
  lastCell = cell
}

function handlePointerDown(event: PointerEvent): void {
  const element = canvas.value
  if (!element || (event.pointerType === 'mouse' && event.button !== 0)) return
  event.preventDefault()
  const point = localPoint(event)
  pointers.set(event.pointerId, { point, start: point })
  element.setPointerCapture(event.pointerId)

  if (pointers.size >= 2) {
    startPinch()
    return
  }

  primaryPointerId = event.pointerId
  pendingPoint = point
  lastCell = undefined
  drawing = false
}

function trackHover(event: PointerEvent): void {
  const point = localPoint(event)
  const cell = screenToWorld(point, viewport.value, canvasSize.value.width, canvasSize.value.height, BASE_CELL_PX)
  emit('hover:cell', cell)
}

function handlePointerMove(event: PointerEvent): void {
  trackHover(event)
  const state = pointers.get(event.pointerId)
  if (!state) return
  const point = localPoint(event)
  state.point = point

  if (pointers.size >= 2) {
    updatePinch()
    return
  }
  if (event.pointerId !== primaryPointerId) return

  const moved = distance(state.start, point)
  if (props.tool === 'pan') {
    if (moved > 0) {
      setViewport({
        ...viewport.value,
        offsetX: viewport.value.offsetX + point.x - state.start.x,
        offsetY: viewport.value.offsetY + point.y - state.start.y,
      })
      state.start = point
    }
    return
  }

  if (!drawing && moved > 4) {
    drawing = true
    if (pendingPoint) {
      lastCell = screenToWorld(pendingPoint, viewport.value, canvasSize.value.width, canvasSize.value.height, BASE_CELL_PX)
    }
    pendingPoint = undefined
    paintAt(point)
    return
  }
  if (drawing) {
    paintAt(point)
  }
}

function endPointer(event: PointerEvent): void {
  const state = pointers.get(event.pointerId)
  if (!state) return
  const isTap = event.type === 'pointerup' && !pinch
    && event.pointerId === primaryPointerId && props.tool !== 'pan'
    && !drawing && pendingPoint
  if (isTap) paintAt(pendingPoint!)
  pointers.delete(event.pointerId)

  if (pointers.size < 2) {
    pinch = undefined
    // The remaining finger after a pinch must not begin a stroke.
    primaryPointerId = undefined
    pendingPoint = undefined
    lastCell = undefined
    drawing = false
  }
  if (canvas.value?.hasPointerCapture(event.pointerId)) {
    canvas.value.releasePointerCapture(event.pointerId)
  }
}

function handleWheel(event: WheelEvent): void {
  const point = localPoint(event)
  zoomAt(point, viewport.value.zoom * Math.exp(-event.deltaY * 0.001))
}

watch(() => props.design, (design) => {
  workingDesign = design
  scheduleRender()
}, { flush: 'sync' })

onMounted(() => {
  if (container.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(container.value)
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resizeCanvas)
  cancelAnimationFrame(renderFrame)
})
</script>

<template>
  <div ref="container" :class="['board-canvas-shell', `is-${tool}`]">
    <canvas
      ref="canvas"
      class="board-canvas"
      aria-label="Khung xếp hạt nhựa ủi"
      @contextmenu.prevent
      @pointercancel="endPointer"
      @lostpointercapture="endPointer"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerleave="emit('hover:cell', null)"
      @pointerup="endPointer"
      @wheel.prevent="handleWheel"
    />
    <div class="viewport-hud" aria-label="Điều khiển khung vẽ">
      <button class="hud-btn" type="button" aria-label="Thu nhỏ" @click="zoomBy(0.8)">
        <Icon name="minus" />
      </button>
      <span class="zoom-readout">{{ Math.round(viewport.zoom * 100) }}%</span>
      <button class="hud-btn" type="button" aria-label="Phóng to" @click="zoomBy(1.25)">
        <Icon name="plus" />
      </button>
      <span class="hud-divider" aria-hidden="true" />
      <button class="hud-btn" type="button" aria-label="Đặt lại khung" @click="resetViewport">
        <Icon name="target" />
      </button>
    </div>
  </div>
</template>
