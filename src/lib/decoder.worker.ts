import jsQR from 'jsqr'

const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>) => void
  postMessage: (data: { text: string | null; error?: string }) => void
}
scope.onmessage = ({ data }) => {
  try {
    let result = null
    // 大码点会干扰 jsQR 的局部阈值，先缩小识别，再以原图保留密集二维码的细节。
    const edge = Math.max(data.width, data.height)
    if (edge > 512) {
      const source = new OffscreenCanvas(data.width, data.height)
      source.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height), 0, 0)
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
    scope.postMessage({ text: result?.data ?? null })
  } catch {
    scope.postMessage({ text: null, error: '图片无法识别，请换一张清晰的图片' })
  }
}
