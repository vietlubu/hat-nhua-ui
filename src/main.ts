/// <reference types="vite-plugin-pwa/client" />

import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import './styles.css'
import App from './App.vue'

registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new Event('pwa:offline-ready'))
  },
  onNeedRefresh() {
    window.dispatchEvent(new Event('pwa:update-ready'))
  },
})

createApp(App).mount('#app')
