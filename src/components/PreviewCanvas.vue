<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Design } from '../domain/design'
import {
  DEFAULT_PREVIEW_OPTIONS,
  previewDimensions,
  renderIronedPreview,
} from '../render/ironPreview'

const props = defineProps<{ design: Design }>()
const canvas = ref<HTMLCanvasElement | null>(null)

function draw(): void {
  const element = canvas.value
  if (!element) return
  const dimensions = previewDimensions(props.design, DEFAULT_PREVIEW_OPTIONS)
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const scale = Math.min(dpr, 4096 / Math.max(dimensions.width, dimensions.height))
  element.width = Math.max(1, Math.round(dimensions.width * scale))
  element.height = Math.max(1, Math.round(dimensions.height * scale))
  element.style.aspectRatio = `${dimensions.width} / ${dimensions.height}`
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  renderIronedPreview(ctx, props.design, DEFAULT_PREVIEW_OPTIONS)
}

watch(() => props.design, draw, { deep: true })

onMounted(() => {
  window.addEventListener('resize', draw)
  draw()
})

onBeforeUnmount(() => window.removeEventListener('resize', draw))
</script>

<template>
  <div class="preview-canvas-shell">
    <canvas v-show="design.beads.length > 0" ref="canvas" class="preview-canvas" aria-label="Preview sản phẩm sau khi ủi" />
    <p v-if="design.beads.length === 0" class="empty-preview">Chưa có hạt</p>
  </div>
</template>
