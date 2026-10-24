import { describe, expect, it } from 'vitest'
import { MAX_TEXT_BYTES, PRESETS, contrast, makeQrSvg, textBytes, type QrStyle } from '../src/lib/qr'

const style: QrStyle = { ...PRESETS[1], shape: 'rounded', gradient: false, logo: '' }
describe('二维码内容与安全配色', () => {
  it('按 UTF-8 字节校验，保留空白与换行', () => {
    expect(textBytes('中😀\n')).toBe(8)
    expect(() => makeQrSvg('', style)).toThrow('先写点内容')
    expect(() => makeQrSvg('a'.repeat(MAX_TEXT_BYTES + 1), style)).toThrow('内容过长')
    expect(() => makeQrSvg('中'.repeat(401), style)).toThrow('内容过长')
    expect(makeQrSvg(' \n ', style).svg).not.toBe(makeQrSvg(' ', style).svg)
  })
  it('六套预设及渐变都有足够对比度', () => {
    for (const preset of PRESETS) {
      expect(contrast(preset.foreground, preset.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(preset.accent, preset.background)).toBeGreaterThanOrEqual(4.5)
      expect(() => makeQrSvg('你好，世界 🌸', { ...style, ...preset, gradient: true })).not.toThrow()
    }
    expect(() => makeQrSvg('hello', { ...style, foreground: '#ffffff' })).toThrow('颜色太接近')
    expect(() => makeQrSvg('hello', { ...style, gradient: true, accent: '#ffffff' })).toThrow('颜色太接近')
    expect(() => makeQrSvg('hello', { ...style, background: '#111111' })).toThrow('颜色太接近')
  })
  it('拒绝外部 Logo 和 SVG 属性注入，原始文本不会进入 SVG 标记', () => {
    expect(() => makeQrSvg('hello', { ...style, foreground: 'red"/><script/>' })).toThrow('颜色')
    expect(() => makeQrSvg('hello', { ...style, logo: 'https://example.com/logo.png' })).toThrow('Logo')
    expect(() => makeQrSvg('hello', { ...style, logo: 'data:image/svg+xml,<svg onload="alert(1)"/>' })).toThrow('Logo')
    expect(() => makeQrSvg('hello', { ...style, shape: 'invalid' as QrStyle['shape'] })).toThrow('码点')
    expect(makeQrSvg('<script>alert(1)</script>', style).svg).not.toContain('<script>')
  })
  it('每种样式都保留四模块静区，并支持最大内容', () => {
    for (const shape of ['square', 'rounded', 'dots'] as const) {
      const qr = makeQrSvg('内容\nhttps://example.com?q=1&lang=中文', { ...style, shape })
      expect(qr.svg).toContain(`viewBox="0 0 ${qr.modules + 8} ${qr.modules + 8}"`)
      expect(qr.svg).toContain('x="4" y="4" width="1" height="1"')
    }
    expect(() => makeQrSvg('a'.repeat(MAX_TEXT_BYTES), style)).not.toThrow()
  })
})
