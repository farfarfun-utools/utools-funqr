export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
const WORKER_IDLE_MS = 30_000

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前环境无法处理图片')
  return { element, context }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,([\da-z+/=]+)$/i.exec(dataUrl)
  if (!match) throw new Error('图片数据无效')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: match[1] })
}

export function loadImage(source: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return }
    const image = new Image()
    const cleanup = () => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      image.src = ''
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      cleanup()
      image.src = ''
      reject(new Error('图片读取超时，请换一张图片'))
    }, 15_000)
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error('图片无法读取，请检查文件格式')) }
    signal?.addEventListener('abort', abort, { once: true })
    image.src = source
  })
}

export async function imageCanvas(blob: Blob, maxEdge = 2048, options: { fillBackground?: boolean; signal?: AbortSignal } = {}) {
  const { fillBackground = true, signal } = options
  if (!IMAGE_TYPES.includes(blob.type)) throw new Error('请选择 PNG、JPG、WebP、GIF 或 BMP 图片')
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 20 MB，且不能为空')
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url, signal)
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效，请换一张图片')
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('图片尺寸过大，请裁剪至二维码附近后重试')
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
    const result = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)))
    if (fillBackground) {
      result.context.fillStyle = '#fff'
      result.context.fillRect(0, 0, result.element.width, result.element.height)
    }
    result.context.drawImage(image, 0, 0, result.element.width, result.element.height)
    return result.element
  } finally { URL.revokeObjectURL(url) }
}

interface DecodeJob {
  id: number
  pixels: Uint8ClampedArray
  width: number
  height: number
  signal?: AbortSignal
  onAbort: () => void
  timer?: ReturnType<typeof setTimeout>
  resolve: (value: string | null) => void
  reject: (reason: unknown) => void
}

let sharedWorker: Worker | null = null
let activeJob: DecodeJob | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined
let nextJobId = 1
const pendingJobs: DecodeJob[] = []

function clearIdleTimer() {
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }
}

function scheduleIdleTerminate() {
  clearIdleTimer()
  if (!sharedWorker || activeJob || pendingJobs.length) return
  idleTimer = setTimeout(() => {
    idleTimer = undefined
    if (sharedWorker && !activeJob && !pendingJobs.length) {
      sharedWorker.terminate()
      sharedWorker = null
    }
  }, WORKER_IDLE_MS)
}

function terminateWorker() {
  clearIdleTimer()
  if (sharedWorker) {
    sharedWorker.terminate()
    sharedWorker = null
  }
}

function cleanupJob(job: DecodeJob) {
  if (job.timer !== undefined) {
    clearTimeout(job.timer)
    job.timer = undefined
  }
  job.signal?.removeEventListener('abort', job.onAbort)
}

function ensureWorker(): Worker {
  if (sharedWorker) return sharedWorker
  const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }: MessageEvent<{ id?: number; text: string | null; error?: string }>) => {
    const job = activeJob
    if (!job || (data.id !== undefined && data.id !== job.id)) return
    activeJob = null
    cleanupJob(job)
    if (data.error) job.reject(new Error(data.error))
    else job.resolve(data.text)
    pumpQueue()
  }
  const handleFailure = () => {
    terminateWorker()
    const job = activeJob
    activeJob = null
    if (job) {
      cleanupJob(job)
      job.reject(new Error('识别失败，请重新选择图片'))
    }
    pumpQueue()
  }
  worker.onerror = handleFailure
  worker.onmessageerror = handleFailure
  sharedWorker = worker
  return worker
}

function pumpQueue() {
  if (activeJob) return
  const next = pendingJobs.shift()
  if (!next) {
    scheduleIdleTerminate()
    return
  }
  clearIdleTimer()
  activeJob = next
  next.timer = setTimeout(() => {
    if (activeJob !== next) return
    activeJob = null
    cleanupJob(next)
    terminateWorker()
    next.reject(new Error('识别超时，请裁剪图片后重试'))
    pumpQueue()
  }, 15_000)
  try {
    const worker = ensureWorker()
    worker.postMessage({ id: next.id, pixels: next.pixels, width: next.width, height: next.height }, [next.pixels.buffer])
  } catch {
    activeJob = null
    cleanupJob(next)
    terminateWorker()
    next.reject(new Error('识别失败，请重新选择图片'))
    pumpQueue()
  }
}

export function decodeCanvas(element: HTMLCanvasElement, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return }
    const context = element.getContext('2d', { willReadFrequently: true })
    if (!context) { reject(new Error('当前环境无法读取图片')); return }
    const { data, width, height } = context.getImageData(0, 0, element.width, element.height)
    const job: DecodeJob = {
      id: nextJobId++,
      pixels: data,
      width,
      height,
      signal,
      onAbort: () => {
        if (activeJob === job) {
          activeJob = null
          cleanupJob(job)
          terminateWorker()
          reject(new DOMException('已取消', 'AbortError'))
          pumpQueue()
          return
        }
        const index = pendingJobs.indexOf(job)
        if (index !== -1) {
          pendingJobs.splice(index, 1)
          cleanupJob(job)
          reject(new DOMException('已取消', 'AbortError'))
        }
      },
      resolve,
      reject,
    }
    signal?.addEventListener('abort', job.onAbort, { once: true })
    pendingJobs.push(job)
    pumpQueue()
  })
}

export async function decodeImage(blob: Blob, signal?: AbortSignal) {
  const image = await imageCanvas(blob, 2048, { signal })
  const text = await decodeCanvas(image, signal)
  if (text === null) throw new Error('没有发现二维码，请换一张清晰图片，或裁剪至二维码附近')
  return { text, image }
}

export async function rasterize(svg: string, size: number, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url, signal)
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效')
    const result = canvas(size, Math.max(1, Math.round(size * image.naturalHeight / image.naturalWidth)))
    result.context.drawImage(image, 0, 0, result.element.width, result.element.height)
    return result.element
  } finally { URL.revokeObjectURL(url) }
}

export async function clipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) throw new Error('当前环境不支持读取剪贴板图片，请直接粘贴或选择图片')
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find(type => IMAGE_TYPES.includes(type))
    if (type) return item.getType(type)
  }
  throw new Error('剪贴板中没有图片，请先复制一张二维码图片')
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
