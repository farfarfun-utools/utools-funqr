<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import Icon from './components/Icon.vue'
import Generator from './components/Generator.vue'
import Scanner from './components/Scanner.vue'

const view = ref<'generate' | 'decode'>('generate')
const content = ref('')
const scanner = ref<InstanceType<typeof Scanner>>()
const notification = ref('')
type Theme = 'system' | 'light' | 'dark'
function readTheme(): Theme {
  try { const value = localStorage.getItem('funqr-theme'); if (value === 'dark' || value === 'light') return value } catch { /* 无存储权限时使用系统主题。 */ }
  return 'system'
}
const theme = ref<Theme>(readTheme())
const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(window.utools?.isDarkColors?.() ?? media.matches)
const themeNames = { system: '跟随系统', light: '浅色', dark: '深色' }
const themeIcons = { system: 'monitor', light: 'sun', dark: 'moon' } as const
watchEffect(() => { document.documentElement.dataset.theme = theme.value === 'system' ? systemDark.value ? 'dark' : 'light' : theme.value })
function toggleTheme() {
  theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system'
  try { localStorage.setItem('funqr-theme', theme.value) } catch { /* 当前会话的主题仍然生效。 */ }
}
function generate(text: string) { content.value = text; view.value = 'generate' }
function paste(event: ClipboardEvent) { if (view.value === 'decode') scanner.value?.paste(event) }
let toastTimer: ReturnType<typeof setTimeout>
let alive = false
function notify(text: string) {
  clearTimeout(toastTimer)
  notification.value = text
  toastTimer = setTimeout(() => { notification.value = '' }, 2600)
}
function syncTheme() { systemDark.value = window.utools?.isDarkColors?.() ?? media.matches }
onMounted(() => {
  alive = true
  media.addEventListener('change', syncTheme)
  window.addEventListener('paste', paste)
  window.utools?.onPluginEnter(({ code, payload }) => {
    if (!alive) return
    syncTheme()
    view.value = code === 'decode' ? 'decode' : 'generate'
    if (code === 'text-qr' && typeof payload === 'string') content.value = payload
  })
})
onUnmounted(() => { alive = false; clearTimeout(toastTimer); media.removeEventListener('change', syncTheme); window.removeEventListener('paste', paste) })
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand"><span class="brand-icon"><Icon name="qr" /></span><div><h1>码上生花 <span>FunQR</span></h1><p>小小方寸，大有心意</p></div></div>
      <nav class="view-switch" aria-label="二维码工具"><button :class="{ active: view === 'generate' }" :aria-pressed="view === 'generate'" @click="view = 'generate'"><Icon name="qr" />生成二维码</button><button :class="{ active: view === 'decode' }" :aria-pressed="view === 'decode'" @click="view = 'decode'"><Icon name="scan" />识别二维码</button></nav>
      <button class="icon-button theme-button" :aria-label="`主题：${themeNames[theme]}，点击切换`" :title="`主题：${themeNames[theme]}，点击切换`" @click="toggleTheme"><Icon :name="themeIcons[theme]" /></button>
    </header>
    <main>
      <div class="intro"><div><span class="eyebrow">{{ view === 'generate' ? 'A LITTLE CODE, A LOT OF POSSIBILITIES' : 'EVERY CODE HAS A STORY' }}</span><h2>{{ view === 'generate' ? '把灵感，装进方寸之间。' : '轻轻一扫，让信息相见。' }}</h2></div><span class="offline-pill"><i></i>完全离线</span></div>
      <Generator v-show="view === 'generate'" v-model="content" @notify="notify" />
      <Scanner v-show="view === 'decode'" ref="scanner" @generate="generate" @notify="notify" />
    </main>
    <footer class="app-footer"><span><Icon name="shield" />本地处理 · 无上传 · 无历史记录</span><span>让每一次分享，都多一点美好</span></footer>
    <div v-if="notification" class="toast" role="status"><Icon name="check" />{{ notification }}</div>
  </div>
</template>
