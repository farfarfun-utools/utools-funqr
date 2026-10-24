export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前环境无法处理图片')
  return { element, context }
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => { image.src = ''; reject(new Error('图片读取超时，请换一张图片')) }, 15_000)
    image.onload = () => { clearTimeout(timer); resolve(image) }
    image.onerror = () => { clearTimeout(timer); reject(new Error('图片无法读取，请检查文件格式')) }
    image.src = source
  })
}

export async function imageCanvas(blob: Blob, maxEdge = 2048) {
  if (!IMAGE_TYPES.includes(blob.type)) throw new Error('请选择 PNG、JPG、WebP、GIF 或 BMP 图片')
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error('图片不能超过 20 MB，且不能为空')
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('图片尺寸过大，请裁剪至二维码附近后重试')
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
    const result = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)))
    result.context.fillStyle = '#fff'
    result.context.fillRect(0, 0, result.element.width, result.element.height)
    result.context.drawImage(image, 0, 0, result.element.width, result.element.height)
    return result.element
  } finally { URL.revokeObjectURL(url) }
}

export function decodeCanvas(element: HTMLCanvasElement, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return }
    const context = element.getContext('2d', { willReadFrequently: true })
    if (!context) { reject(new Error('当前环境无法读取图片')); return }
    const { data, width, height } = context.getImageData(0, 0, element.width, element.height)
    const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' })
    const stop = () => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { stop(); reject(new DOMException('已取消', 'AbortError')) }
    const timer = setTimeout(() => { stop(); reject(new Error('识别超时，请裁剪图片后重试')) }, 15_000)
    worker.onmessage = ({ data }: MessageEvent<{ text: string | null; error?: string }>) => {
      stop()
      if (data.error) reject(new Error(data.error))
      else resolve(data.text)
    }
    worker.onerror = () => { stop(); reject(new Error('识别失败，请重新选择图片')) }
    signal?.addEventListener('abort', abort, { once: true })
    worker.postMessage({ pixels: data, width, height }, [data.buffer])
  })
}

export async function decodeImage(blob: Blob, signal?: AbortSignal) {
  const image = await imageCanvas(blob)
  const text = await decodeCanvas(image, signal)
  if (text === null) throw new Error('没有发现二维码，请换一张清晰图片，或裁剪至二维码附近')
  return { text, preview: image.toDataURL('image/png') }
}

export async function rasterize(svg: string, size: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url)
    const result = canvas(size, size)
    result.context.drawImage(image, 0, 0, size, size)
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
