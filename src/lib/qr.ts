import QRCode from 'qrcode'

export const MAX_TEXT_BYTES = 1200
export const PRESETS = [
  { name: '经典墨黑', foreground: '#252838', background: '#ffffff', accent: '#252838' },
  { name: '紫藤花开', foreground: '#594082', background: '#faf7ff', accent: '#98517b' },
  { name: '海盐蓝调', foreground: '#24557e', background: '#f1f9ff', accent: '#247776' },
  { name: '森林来信', foreground: '#305e4b', background: '#f4f8ef', accent: '#65702e' },
  { name: '落日珊瑚', foreground: '#914c3c', background: '#fff6ee', accent: '#9e465c' },
  { name: '咖啡时光', foreground: '#645040', background: '#faf5ed', accent: '#8c603b' },
]
export type Shape = 'square' | 'rounded' | 'dots'
export interface QrStyle {
  foreground: string
  background: string
  accent: string
  gradient: boolean
  shape: Shape
  logo: string
}
export function textBytes(text: string) { return new TextEncoder().encode(text).length }

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

export function contrast(dark: string, light: string): number {
  return (luminance(light) + 0.05) / (luminance(dark) + 0.05)
}

export function makeQrSvg(text: string, style: QrStyle) {
  if (!text.length) throw new Error('先写点内容，让灵感变成二维码')
  if (textBytes(text) > MAX_TEXT_BYTES) throw new Error(`内容过长，请控制在 ${MAX_TEXT_BYTES} 字节内（汉字通常占 3 字节）`)
  if (![style.foreground, style.background, style.accent].every(color => /^#[\da-f]{6}$/i.test(color))) throw new Error('请选择有效的颜色')
  if (contrast(style.foreground, style.background) < 4.5 || (style.gradient && contrast(style.accent, style.background) < 4.5)) throw new Error('颜色太接近了，请选择更深的码点或更浅的背景')
  if (!['square', 'rounded', 'dots'].includes(style.shape)) throw new Error('不支持的码点样式')
  if (style.logo && !/^data:image\/png;base64,[\da-z+/=]+$/i.test(style.logo)) throw new Error('Logo 图片无效，请重新上传')

  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size
  const edge = size + 8
  const cells: string[] = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.get(row, col)) continue
      const x = col + 4, y = row + 4
      // 定位、校正、时序和格式模块保留原形，装饰只作用于数据码点。
      const shape = qr.modules.isReserved(row, col) ? 'square' : style.shape
      cells.push(shape === 'dots'
        ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.47"/>`
        : `<rect x="${x}" y="${y}" width="1" height="1"${shape === 'rounded' ? ' rx="0.28"' : ' shape-rendering="crispEdges"'}/>`)
    }
  }
  const logoEdge = Math.max(3, Math.floor(size * 0.15))
  const logoX = (edge - logoEdge) / 2
  const logo = style.logo ? `<rect x="${logoX - 0.65}" y="${logoX - 0.65}" width="${logoEdge + 1.3}" height="${logoEdge + 1.3}" rx="0.8" fill="${style.background}"/><image href="${style.logo}" x="${logoX}" y="${logoX}" width="${logoEdge}" height="${logoEdge}"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${edge * 16}" height="${edge * 16}" viewBox="0 0 ${edge} ${edge}"><defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.foreground}"/><stop offset="1" stop-color="${style.accent}"/></linearGradient></defs><rect width="${edge}" height="${edge}" fill="${style.background}"/><g fill="${style.gradient ? 'url(#ink)' : style.foreground}">${cells.join('')}</g>${logo}</svg>`
  return { svg, modules: size }
}
