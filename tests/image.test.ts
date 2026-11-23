// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataUrlToBlob, decodeCanvas, imageCanvas, MAX_IMAGE_BYTES } from '../src/lib/image'

interface PostedMessage {
  id: number
  pixels: Uint8ClampedArray
  width: number
  height: number
}

class StubWorker {
  static instances: StubWorker[] = []
  onmessage: ((event: MessageEvent<{ id?: number; text: string | null; error?: string }>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: ((event: Event) => void) | null = null
  terminated = false
  posted: PostedMessage[] = []

  constructor(_url: URL | string, _options?: WorkerOptions) {
    StubWorker.instances.push(this)
  }

  postMessage(message: PostedMessage, _transfer?: Transferable[]) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emitResult(id: number, text: string | null, error?: string) {
    this.onmessage?.({ data: { id, text, error } } as MessageEvent<{ id?: number; text: string | null; error?: string }>)
  }

  emitMessageError() {
    this.onmessageerror?.(new Event('messageerror'))
  }
}

function makeFakeCanvas(width = 8, height = 8) {
  const getImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }))
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  vi.spyOn(element, 'getContext').mockReturnValue({ getImageData } as unknown as CanvasRenderingContext2D)
  return element
}

describe('dataUrlToBlob', () => {
  it('能无损还原 base64 Data URL 为对应 MIME 与字节内容的 Blob', async () => {
    const raw = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x41, 0x42])
    const base64 = btoa(String.fromCharCode(...raw))
    const blob = dataUrlToBlob(`data:image/png;base64,${base64}`)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(raw.length)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(raw)
  })

  it('拒绝非法或非 base64 的图片数据', () => {
    expect(() => dataUrlToBlob('')).toThrow('图片数据无效')
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow('图片数据无效')
    expect(() => dataUrlToBlob('data:image/svg+xml,<svg/>')).toThrow('图片数据无效')
    expect(() => dataUrlToBlob('data:image/png;base64,not valid!')).toThrow('图片数据无效')
  })
})

describe('imageCanvas', () => {
  const createdUrls: string[] = []
  const revokedUrls: string[] = []

  beforeEach(() => {
    createdUrls.length = 0
    revokedUrls.length = 0
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        const url = `blob:mock-${createdUrls.length + 1}`
        createdUrls.push(url)
        return url
      }),
      revokeObjectURL: vi.fn((url: string) => {
        revokedUrls.push(url)
      }),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubImageAndCanvas(naturalWidth: number, naturalHeight: number) {
    class StubImage {
      naturalWidth = naturalWidth
      naturalHeight = naturalHeight
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        if (!value) return
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', StubImage)

    const calls: string[] = []
    const fillRect = vi.fn((...args: number[]) => { calls.push(`fillRect:${args.join(',')}`) })
    const drawImage = vi.fn((...args: unknown[]) => { calls.push(`drawImage:${args.slice(1).join(',')}`) })
    const context = {
      fillStyle: '',
      fillRect,
      drawImage,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    return { context, calls, fillRect, drawImage }
  }

  it('默认 fillBackground: true 先铺白底再绘原图，并按 maxEdge 等比缩放且释放对象 URL', async () => {
    const { context, calls, fillRect, drawImage } = stubImageAndCanvas(400, 200)
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const result = await imageCanvas(blob, 200)

    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(context.fillStyle).toBe('#fff')
    expect(fillRect).toHaveBeenCalledWith(0, 0, 200, 100)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 100)
    expect(calls).toEqual(['fillRect:0,0,200,100', 'drawImage:0,0,200,100'])
    expect(revokedUrls).toEqual(createdUrls)
  })

  it('fillBackground: false 保留透明通道，不调用 fillRect', async () => {
    const { fillRect, drawImage } = stubImageAndCanvas(128, 128)
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const result = await imageCanvas(blob, 256, { fillBackground: false })

    expect(result.width).toBe(128)
    expect(result.height).toBe(128)
    expect(fillRect).not.toHaveBeenCalled()
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 128, 128)
    expect(revokedUrls).toEqual(createdUrls)
  })

  it('拒绝不支持的格式、空文件、超大文件与超大像素尺寸', async () => {
    await expect(imageCanvas(new Blob(['svg'], { type: 'image/svg+xml' }))).rejects.toThrow('PNG')
    await expect(imageCanvas(new Blob([], { type: 'image/png' }))).rejects.toThrow('20 MB')
    const oversized = { type: 'image/png', size: MAX_IMAGE_BYTES + 1 } as Blob
    await expect(imageCanvas(oversized)).rejects.toThrow('20 MB')

    stubImageAndCanvas(6000, 5000)
    await expect(imageCanvas(new Blob([new Uint8Array([1])], { type: 'image/png' }))).rejects.toThrow('尺寸过大')
    expect(revokedUrls).toEqual(createdUrls)

    stubImageAndCanvas(0, 100)
    await expect(imageCanvas(new Blob([new Uint8Array([1])], { type: 'image/png' }))).rejects.toThrow('尺寸无效')
    expect(revokedUrls).toEqual(createdUrls)
  })
})

describe('decodeCanvas Worker 生命周期与异常恢复', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    StubWorker.instances = []
    vi.stubGlobal('Worker', StubWorker)
  })

  afterEach(() => {
    // 触发空闲回收，确保模块级 sharedWorker 不泄漏到下一个用例。
    vi.advanceTimersByTime(31_000)
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('复用持久 Worker 执行多次识别，空闲 30 秒后自动回收并在新任务时重建', async () => {
    const first = decodeCanvas(makeFakeCanvas())
    expect(StubWorker.instances).toHaveLength(1)
    const worker1 = StubWorker.instances[0]
    expect(worker1.posted).toHaveLength(1)
    worker1.emitResult(worker1.posted[0].id, 'qr-1')
    expect(await first).toBe('qr-1')

    const second = decodeCanvas(makeFakeCanvas())
    expect(StubWorker.instances).toHaveLength(1)
    expect(worker1.terminated).toBe(false)
    expect(worker1.posted).toHaveLength(2)
    worker1.emitResult(worker1.posted[1].id, 'qr-2')
    expect(await second).toBe('qr-2')

    vi.advanceTimersByTime(30_000)
    expect(worker1.terminated).toBe(true)

    const third = decodeCanvas(makeFakeCanvas())
    expect(StubWorker.instances).toHaveLength(2)
    const worker2 = StubWorker.instances[1]
    worker2.emitResult(worker2.posted[0].id, 'qr-3')
    expect(await third).toBe('qr-3')
  })

  it('遇到 onmessageerror 时销毁损坏 Worker、拒绝当前任务并自动恢复后续排队任务', async () => {
    const first = decodeCanvas(makeFakeCanvas())
    const second = decodeCanvas(makeFakeCanvas())

    expect(StubWorker.instances).toHaveLength(1)
    const broken = StubWorker.instances[0]
    broken.emitMessageError()

    await expect(first).rejects.toThrow('识别失败，请重新选择图片')
    expect(broken.terminated).toBe(true)

    expect(StubWorker.instances).toHaveLength(2)
    const recovered = StubWorker.instances[1]
    expect(recovered.posted).toHaveLength(1)
    recovered.emitResult(recovered.posted[0].id, 'recovered-after-messageerror')
    expect(await second).toBe('recovered-after-messageerror')
  })

  it('支持中断运行中任务与排队中任务，并从中断与超时后自动重建 Worker 恢复', async () => {
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(decodeCanvas(makeFakeCanvas(), preAborted.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(StubWorker.instances).toHaveLength(0)

    const activeAbort = new AbortController()
    const queuedAbort = new AbortController()
    const job1 = decodeCanvas(makeFakeCanvas(), activeAbort.signal)
    const job2 = decodeCanvas(makeFakeCanvas(), queuedAbort.signal)
    const job3 = decodeCanvas(makeFakeCanvas())

    expect(StubWorker.instances).toHaveLength(1)
    const worker1 = StubWorker.instances[0]

    // 中断排队中的任务不会销毁正在执行的 Worker。
    queuedAbort.abort()
    await expect(job2).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker1.terminated).toBe(false)

    // 中断运行中的任务会销毁当前 Worker，并立刻在重建的 Worker 上推进后续任务。
    activeAbort.abort()
    await expect(job1).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker1.terminated).toBe(true)

    expect(StubWorker.instances).toHaveLength(2)
    const worker2 = StubWorker.instances[1]
    expect(worker2.posted).toHaveLength(1)

    // 模拟超时后销毁 Worker，后续新任务仍可正常识别。
    const job4 = decodeCanvas(makeFakeCanvas())
    vi.advanceTimersByTime(15_000)
    await expect(job3).rejects.toThrow('识别超时，请裁剪图片后重试')
    expect(worker2.terminated).toBe(true)

    expect(StubWorker.instances).toHaveLength(3)
    const worker3 = StubWorker.instances[2]
    expect(worker3.posted).toHaveLength(1)
    worker3.emitResult(worker3.posted[0].id, 'recovered-after-timeout')
    expect(await job4).toBe('recovered-after-timeout')
  })
})
