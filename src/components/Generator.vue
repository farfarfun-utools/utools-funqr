<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { MAX_TEXT_BYTES, PRESETS, makeQrSvg, textBytes, type QrStyle, type Shape } from '../lib/qr'
import { decodeCanvas, imageCanvas, rasterize, saveBlob } from '../lib/image'

const content = defineModel<string>({ required: true })
const emit = defineEmits<{ notify: [text: string] }>()
const style = reactive<QrStyle>({ ...PRESETS[1], gradient: false, shape: 'rounded', logo: '' })
const shapes: { value: Shape; label: string }[] = [{ value: 'square', label: '方块' }, { value: 'rounded', label: '圆角' }, { value: 'dots', label: '圆点' }]
const size = ref(1024)
const png = ref('')
const svg = ref('')
const error = ref('')
const actionError = ref('')
const busy = ref(false)
const logoBusy = ref(false)
const bytes = computed(() => textBytes(content.value))
const ready = computed(() => !!png.value && !busy.value && !error.value)
const activePreset = computed(() => PRESETS.findIndex(preset => preset.foreground === style.foreground && preset.background === style.background && preset.accent === style.accent))
let controller: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let alive = true

watch([content, style, size], () => {
  clearTimeout(timer)
  controller?.abort()
  png.value = ''; svg.value = ''; error.value = ''; actionError.value = ''
  busy.value = !!content.value.length
  if (!content.value.length) return
  const request = new AbortController()
  controller = request
  timer = setTimeout(async () => {
    try {
      const result = makeQrSvg(content.value, style)
      const original = content.value
      const canvas = await rasterize(result.svg, size.value)
      const decoded = await decodeCanvas(canvas, request.signal)
      if (request.signal.aborted || !alive) return
      if (decoded !== original) throw new Error('当前样式不易识别，请增大尺寸、移除 Logo 或改用方块码点')
      svg.value = result.svg
      png.value = canvas.toDataURL('image/png')
    } catch (cause) {
      if (!request.signal.aborted && alive) error.value = cause instanceof Error ? cause.message : '生成失败，请重新输入'
    } finally {
      if (!request.signal.aborted && alive) busy.value = false
    }
  }, 220)
}, { deep: true, immediate: true })

function setPreset(index: number) { Object.assign(style, PRESETS[index]) }
async function pasteText() {
  try {
    if (!navigator.clipboard?.readText) throw new Error('无法读取剪贴板，请使用 Ctrl / ⌘ + V 粘贴')
    content.value = await navigator.clipboard.readText()
  } catch { actionError.value = '无法读取剪贴板，请点击输入框后按 Ctrl / ⌘ + V 粘贴' }
}
async function uploadLogo(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  logoBusy.value = true
  actionError.value = ''
  try {
    const image = await imageCanvas(file, 256)
    if (alive) style.logo = image.toDataURL('image/png')
  } catch (cause) { if (alive) actionError.value = cause instanceof Error ? cause.message : 'Logo 读取失败' }
  finally { if (alive) logoBusy.value = false }
}
async function exportImage(format: 'png' | 'svg') {
  if (!ready.value) return
  actionError.value = ''
  try {
    if (window.funqr) {
      if (window.funqr.saveFile(format === 'png' ? png.value : svg.value, format)) emit('notify', '已保存二维码')
      return
    }
    const blob = format === 'svg' ? new Blob([svg.value], { type: 'image/svg+xml' }) : await (await fetch(png.value)).blob()
    saveBlob(blob, `FunQR-${size.value}.${format}`)
    emit('notify', '已开始下载二维码')
  } catch (cause) { actionError.value = cause instanceof Error ? cause.message : '保存失败，请重试' }
}
async function copyImage() {
  if (!ready.value) return
  actionError.value = ''
  try {
    if (window.utools?.copyImage) {
      if (!window.utools.copyImage(png.value)) throw new Error('复制失败')
    } else {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('当前环境不支持复制图片，请下载 PNG')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await (await fetch(png.value)).blob() })])
    }
    emit('notify', '二维码图片已复制')
  } catch (cause) { actionError.value = cause instanceof Error ? cause.message : '复制失败，请下载 PNG' }
}
onUnmounted(() => { alive = false; clearTimeout(timer); controller?.abort() })
</script>

<template>
  <div class="generator workspace">
    <section class="editor-column" aria-label="二维码内容与样式">
      <div class="section-heading"><span class="step">01</span><h2>写下你的内容</h2><span class="section-note">文字、网址，都可以</span></div>
      <div class="text-editor" :class="{ invalid: bytes > MAX_TEXT_BYTES }">
        <label class="sr-only" for="qr-content">二维码内容</label>
        <textarea id="qr-content" v-model="content" spellcheck="false" placeholder="输入文字、网址，或粘贴一段想分享的内容…" />
        <div class="editor-tools"><button @click="pasteText"><Icon name="clipboard" />粘贴内容</button><button v-if="content" class="clear-text" @click="content = ''">清空</button><span :class="{ danger: bytes > MAX_TEXT_BYTES }">{{ bytes }} / {{ MAX_TEXT_BYTES }} 字节</span></div>
      </div>
      <button v-if="!content" class="sample-link" @click="content = 'https://farfarfun.github.io'">试试示例网址 <Icon name="arrow" /></button>
      <div v-else class="input-tip"><Icon name="shield" />内容仅在本机处理，不保存历史记录</div>

      <div class="section-heading style-heading"><span class="step">02</span><h2>让它与众不同</h2><span class="section-note">一点设计，更多心意</span></div>
      <div class="presets" aria-label="配色预设"><button v-for="(preset, index) in PRESETS" :key="preset.name" :aria-label="preset.name" :aria-pressed="activePreset === index" :class="{ active: activePreset === index }" @click="setPreset(index)"><span class="preset-color" :style="{ background: preset.background, color: preset.foreground }"><Icon name="qr" /></span><span>{{ preset.name }}</span></button></div>

      <div class="style-controls">
        <div class="control-row"><span class="control-label">码点样式</span><div class="shape-options"><button v-for="item in shapes" :key="item.value" :aria-pressed="style.shape === item.value" :class="{ active: style.shape === item.value }" @click="style.shape = item.value"><i :class="item.value"></i>{{ item.label }}</button></div></div>
        <div class="control-row"><span class="control-label">自定义配色</span><div class="color-controls"><label><input v-model="style.foreground" type="color" aria-label="码点颜色" /><span>码点</span></label><label><input v-model="style.background" type="color" aria-label="背景颜色" /><span>背景</span></label><label class="gradient-toggle"><input v-model="style.gradient" type="checkbox" /><span>双色渐变</span></label><input v-if="style.gradient" v-model="style.accent" type="color" aria-label="渐变颜色" /></div></div>
        <div class="control-row"><span class="control-label">中心 Logo <small>可选</small></span><div class="logo-controls"><label class="logo-upload"><img v-if="style.logo" :src="style.logo" alt="已选 Logo" /><Icon v-else name="image" /><span>{{ logoBusy ? '读取中…' : style.logo ? '更换图片' : '添加图片' }}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" :disabled="logoBusy" aria-label="上传中心 Logo" @change="uploadLogo" /></label><button v-if="style.logo" class="icon-button" aria-label="移除 Logo" @click="style.logo = ''"><Icon name="close" /></button></div></div>
      </div>
      <p v-if="error || actionError" class="error-message" role="alert">{{ error || actionError }}</p>
    </section>

    <section class="preview-column" aria-label="二维码预览">
      <div class="preview-stage">
        <div class="preview-heading"><span>LIVE PREVIEW</span><span class="preview-badge">你的专属二维码</span></div>
        <div class="qr-paper" :style="{ background: content ? style.background : undefined }">
          <img v-if="ready" :src="png" alt="生成的二维码" class="qr-image" />
          <div v-else class="empty-qr"><Icon :name="busy ? 'sparkle' : 'qr'" /><strong>{{ busy ? '正在生成与检查…' : error ? '调整一下，再试试' : '让分享，有点不一样' }}</strong><span>{{ busy ? '美观，也要好扫描' : error ? '请查看左侧提示' : '输入内容，二维码即刻呈现' }}</span></div>
        </div>
        <div class="preview-state" :class="{ ready }" role="status"><Icon v-if="ready" name="check" /><span>{{ ready ? '已验证可识别' : busy ? '正在校验扫码结果' : '准备好，传递一点美好' }}</span></div>
        <div class="stage-decoration" aria-hidden="true"><Icon name="sparkle" /></div>
      </div>
      <div class="export-settings"><label for="export-size">PNG 尺寸</label><select id="export-size" v-model.number="size"><option :value="512">512 × 512 px</option><option :value="1024">1024 × 1024 px</option><option :value="2048">2048 × 2048 px</option></select></div>
      <div class="export-actions"><button class="primary-button" :disabled="!ready" @click="exportImage('png')"><Icon name="download" />下载 PNG</button><button class="secondary-button" :disabled="!ready" @click="copyImage"><Icon name="copy" />复制图片</button></div>
      <button class="svg-export" :disabled="!ready" @click="exportImage('svg')">导出 SVG 矢量图 <Icon name="arrow" /></button>
      <p class="export-note">清晰，无水印。适合分享，也适合印刷。</p>
    </section>
  </div>
</template>
