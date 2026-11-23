import jsQR from 'jsqr'

interface DecodeRequest {
  id: number
  pixels: Uint8ClampedArray
  width: number
  height: number
}

interface DecodeResponse {
  id: number
  text: string | null
  error?: string
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<DecodeRequest>) => void
  postMessage: (data: DecodeResponse) => void
}
scope.onmessage = ({ data }) => {
  try {
    let result = null
    // 大码点会干扰 jsQR 的局部阈值，先缩小识别，再以原图保留密集二维码的细节。
    const edge = Math.max(data.width, data.height)
    if (edge > 512 && typeof OffscreenCanvas !== 'undefined') {
      const source = new OffscreenCanvas(data.width, data.height)
      source.getContext('2d')!.putImageData(new ImageData(data.pixels as Uint8ClampedArray<ArrayBuffer>, data.width, data.height), 0, 0)
      for (const size of [512, 768]) {
        if (size >= edge) continue
        const target = new OffscreenCanvas(Math.max(1, Math.round(data.width * size / edge)), Math.max(1, Math.round(data.height * size / edge)))
        const context = target.getContext('2d')!
        context.drawImage(source, 0, 0, target.width, target.height)
        const reduced = context.getImageData(0, 0, target.width, target.height)
        result = jsQR(reduced.data, reduced.width, reduced.height, { inversionAttempts: 'attemptBoth' })
        if (result) break
      }
    }
    result ??= jsQR(data.pixels, data.width, data.height, { inversionAttempts: 'attemptBoth' })
    scope.postMessage({ id: data.id, text: result?.data ?? null })
  } catch {
    scope.postMessage({ id: data.id, text: null, error: '图片无法识别，请换一张清晰的图片' })
  }
}
