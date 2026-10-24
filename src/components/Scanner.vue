<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import { clipboardImage, decodeImage, IMAGE_TYPES, saveBlob } from '../lib/image'

const emit = defineEmits<{ generate: [text: string]; notify: [text: string] }>()
const result = ref<string | null>(null)
const preview = ref('')
const error = ref('')
const busy = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()
let controller: AbortController | undefined
let alive = true

async function scan(blob: Blob) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  busy.value = true; result.value = null; preview.value = ''; error.value = ''
  try {
    const decoded = await decodeImage(blob, request.signal)
    if (!request.signal.aborted && alive) { result.value = decoded.text; preview.value = decoded.preview }
  } catch (cause) {
    if (!request.signal.aborted && alive) error.value = cause instanceof Error ? cause.message : '识别失败，请重试'
  } finally { if (!request.signal.aborted && alive) busy.value = false }
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) void scan(input.files[0])
  input.value = ''
}
function drop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) void scan(file)
  else error.value = '请拖入本地图片文件'
}
function paste(event: ClipboardEvent) {
  const file = Array.from(event.clipboardData?.files ?? []).find(file => IMAGE_TYPES.includes(file.type))
  if (file) { event.preventDefault(); void scan(file) }
}
async function pasteImage() {
  error.value = ''
  try { const blob = await clipboardImage(); if (alive) await scan(blob) }
  catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : '无法读取剪贴板，请直接粘贴图片' }
}
function capture() {
  if (!window.utools?.screenCapture) { error.value = '截图识别需在 uTools 中使用，也可以粘贴截图或选择图片'; return }
  window.utools.screenCapture(async data => {
    if (!data || !alive) return
    try {
      if (!/^data:image\/(png|jpeg);base64,/.test(data)) throw new Error('截图格式不支持')
      await scan(await (await fetch(data)).blob())
    } catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : '截图读取失败' }
  })
}
async function copyText() {
  if (result.value === null) return
  try {
    if (window.utools?.copyText) {
      if (!window.utools.copyText(result.value)) throw new Error('复制失败')
    } else {
      if (!navigator.clipboard?.writeText) throw new Error('请选中结果后手动复制')
      await navigator.clipboard.writeText(result.value)
    }
    emit('notify', '识别结果已复制')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '复制失败，请手动选择并复制' }
}
function exportText() {
  if (result.value === null) return
  try {
    if (window.funqr) {
      if (window.funqr.saveFile(result.value, 'txt')) emit('notify', '已保存识别结果')
    } else { saveBlob(new Blob([result.value], { type: 'text/plain;charset=utf-8' }), 'FunQR-result.txt'); emit('notify', '已开始下载文本') }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败' }
}
defineExpose({ paste })
onUnmounted(() => { alive = false; controller?.abort() })
</script>

<template>
  <div class="scanner workspace">
    <section class="scan-source" aria-label="选择二维码图片">
      <div class="section-heading"><span class="step">01</span><h2>发现图中的信息</h2><span class="section-note">一张图片，就够了</span></div>
      <button class="drop-zone" :class="{ dragging, 'has-image': preview }" :disabled="busy" @click="fileInput?.click()" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
        <img v-if="preview" :src="preview" alt="已识别的二维码图片" />
        <template v-else><span class="upload-symbol"><Icon :name="busy ? 'scan' : 'upload'" /></span><strong>{{ busy ? '正在寻找二维码…' : '拖入图片，读懂二维码' }}</strong><span>{{ busy ? '图片只在本机识别，请稍候' : '或点击此处选择一张图片' }}</span><small>PNG · JPG · WebP · GIF · BMP / 最大 20 MB</small></template>
        <span v-if="preview" class="replace-image"><Icon name="image" />点击换一张图片</span>
      </button>
      <input ref="fileInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="选择二维码图片" @change="chooseFile" />
      <div class="scan-actions"><button class="secondary-button" :disabled="busy" @click="pasteImage"><Icon name="clipboard" />粘贴图片</button><button class="secondary-button" :disabled="busy" @click="capture"><Icon name="scan" />截图识别</button></div>
      <p class="scan-hint">也可以直接按 <kbd>Ctrl / ⌘</kbd> + <kbd>V</kbd> 粘贴图片</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    </section>
    <section class="scan-result" aria-label="二维码识别结果">
      <div class="result-heading"><span>DECODED CONTENT</span><span v-if="result !== null" class="success-label"><Icon name="check" />识别成功</span></div>
      <div v-if="result === null" class="empty-result"><Icon name="scan" /><h2>{{ busy ? '正在解码' : '信息，即将抵达' }}</h2><p>文字、链接，或是一句问候<br />识别后的内容会出现在这里</p></div>
      <template v-else><label class="sr-only" for="scan-output">识别出的文本</label><textarea id="scan-output" :value="result" readonly spellcheck="false" /><div class="result-meta"><span>{{ result.length }} 个字符</span><button @click="exportText">保存文本</button></div></template>
      <div class="result-actions"><button class="primary-button" :disabled="result === null" @click="copyText"><Icon name="copy" />复制内容</button><button class="secondary-button" :disabled="!result" @click="emit('generate', result!)">转为二维码 <Icon name="arrow" /></button></div>
      <p class="result-note"><Icon name="shield" />仅展示原始文本，不会自动打开链接</p>
    </section>
  </div>
</template>
