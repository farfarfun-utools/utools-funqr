// @vitest-environment jsdom
/// <reference types="vitest/jsdom" />
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import { decodeCanvas, decodeImage, imageCanvas, rasterize } from '../src/lib/image'

vi.mock('../src/lib/image', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/image')>()
  return {
    ...actual,
    MAX_IMAGE_BYTES: 20 * 1024 * 1024,
    IMAGE_TYPES: ['image/png'],
    rasterize: vi.fn(), decodeCanvas: vi.fn(), decodeImage: vi.fn(),
    clipboardImage: vi.fn(), imageCanvas: vi.fn(), saveBlob: vi.fn(),
  }
})
let app: VueWrapper
let enter: (action: { code: string; payload?: unknown }) => void
let tools: Map<string, (params?: Record<string, unknown> | null) => unknown | Promise<unknown>>
const generated = 'data:image/png;base64,dGVzdA=='
const toPreview = vi.fn(() => generated)
enableAutoUnmount(afterEach)
beforeEach(() => {
  tools = new Map()
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.mocked(rasterize).mockResolvedValue({ toDataURL: () => generated } as unknown as HTMLCanvasElement)
  vi.mocked(decodeCanvas).mockResolvedValue('hello')
  vi.mocked(decodeImage).mockResolvedValue({ text: 'hello', image: { toDataURL: toPreview } as unknown as HTMLCanvasElement })
  window.utools = { onPluginEnter: callback => { enter = callback }, registerTool: (name, handler) => { tools.set(name, handler) }, copyImage: vi.fn(() => true), copyText: vi.fn(() => true) }
  app = mount(App, { attachTo: document.body })
})
afterEach(() => { delete window.utools; delete window.funqr; vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks() })
async function generate(text = 'hello') {
  await app.get('#qr-content').setValue(text)
  await vi.advanceTimersByTimeAsync(250)
}

it('AI 工具返回校验过的 PNG，不保存内容，并容错空参数', async () => {
  const tool = tools.get('generate_qr_png')!
  expect(await tool({ text: 'hello' })).toEqual({ image: generated, mimeType: 'image/png', size: 512 })
  expect(rasterize).toHaveBeenCalledWith(expect.stringContaining('<svg'), 512)
  await expect(tool({ text: '' })).rejects.toThrow('先写点内容')
  await expect(tool(null)).rejects.toThrow('请提供二维码文本')
  await expect(tool(undefined)).rejects.toThrow('请提供二维码文本')
  vi.mocked(decodeCanvas).mockResolvedValueOnce('different')
  await expect(tool({ text: 'hello' })).rejects.toThrow('识别校验')
  expect(localStorage.length).toBe(0)
})

it('AI 工具识别图片并只返回原文，容错空参数与缺失本机能力', async () => {
  const tool = tools.get('decode_qr_image')!
  expect(await tool({ image: generated })).toEqual({ text: 'hello' })
  expect(decodeImage).toHaveBeenCalledWith(expect.any(Blob))
  await expect(tool({ path: '/tmp/code.png' })).rejects.toThrow('当前环境不支持读取本机文件路径')
  await expect(tool(null)).rejects.toThrow('二选一')
  await expect(tool(undefined)).rejects.toThrow('二选一')
  window.funqr = { saveFile: vi.fn(), readImageFile: vi.fn(() => generated) }
  expect(await tool({ path: '/tmp/code.png' })).toEqual({ text: 'hello' })
  expect(window.funqr.readImageFile).toHaveBeenCalledWith('/tmp/code.png')
  expect(toPreview).not.toHaveBeenCalled()
  await expect(tool({ image: 'https://example.com/code.png' })).rejects.toThrow('图片数据无效')
  await expect(tool({ image: generated, path: '/tmp/code.png' })).rejects.toThrow('二选一')
  expect(localStorage.length).toBe(0)
})

it('空内容不生成示例二维码；校验成功后才允许导出', async () => {
  expect(app.get('.export-actions button').attributes('disabled')).toBeDefined()
  await generate()
  expect(app.get('.qr-image').attributes('src')).toBe(generated)
  expect(app.get('.export-actions button').attributes('disabled')).toBeUndefined()
  await app.get('.export-actions button:last-child').trigger('click')
  expect(window.utools?.copyImage).toHaveBeenCalledWith(generated)
})
it('反向识别不一致和低对比度时禁止导出', async () => {
  vi.mocked(decodeCanvas).mockResolvedValueOnce('different')
  await generate()
  expect(app.get('[role="alert"]').text()).toContain('当前样式不易识别')
  expect(app.find('.qr-image').exists()).toBe(false)
  await app.get('[aria-label="码点颜色"]').setValue('#ffffff')
  await vi.advanceTimersByTimeAsync(250)
  expect(app.get('[role="alert"]').text()).toContain('颜色太接近')
})
it('修改内容后立即撤掉旧图，清空后不保留可导出内容', async () => {
  await generate()
  await app.get('#qr-content').setValue('new content')
  expect(app.find('.qr-image').exists()).toBe(false)
  await app.get('.clear-text').trigger('click')
  await vi.advanceTimersByTimeAsync(250)
  expect(app.get('#qr-content').element).toHaveProperty('value', '')
  expect(app.get('.export-actions button').attributes('disabled')).toBeDefined()
})
it('过期的异步生成结果不能覆盖最新输入', async () => {
  let finish!: (value: string | null) => void
  vi.mocked(decodeCanvas).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await generate()
  await app.get('#qr-content').setValue('second')
  vi.mocked(decodeCanvas).mockResolvedValueOnce('second')
  await vi.advanceTimersByTimeAsync(250)
  finish('hello')
  await vi.advanceTimersByTimeAsync(0)
  expect(app.find('[role="alert"]').exists()).toBe(false)
  expect(app.get('#qr-content').element).toHaveProperty('value', 'second')
  expect(app.find('.qr-image').exists()).toBe(true)
})
it('保存取消不报成功，磁盘错误会反馈', async () => {
  await generate()
  window.funqr = { saveFile: vi.fn(() => false), readImageFile: vi.fn() }
  await app.get('.export-actions button').trigger('click')
  expect(app.find('.toast').exists()).toBe(false)
  window.funqr!.saveFile = () => { throw new Error('磁盘空间不足') }
  await app.get('.export-actions button').trigger('click')
  expect(app.get('[role="alert"]').text()).toContain('磁盘空间不足')
})
it('识别结果可复制并转回生成页，原始文本不作为 HTML 执行', async () => {
  enter({ code: 'decode' })
  const source = '<img src=x onerror=alert(1)>'
  vi.mocked(decodeImage).mockResolvedValueOnce({ text: source, image: { toDataURL: toPreview } as unknown as HTMLCanvasElement })
  const input = app.get('input[aria-label="选择二维码图片"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['png'], 'test.png', { type: 'image/png' })] })
  await input.trigger('change')
  await vi.advanceTimersByTimeAsync(0)
  expect(app.get('#scan-output').element).toHaveProperty('value', source)
  expect(app.get('.drop-zone img').attributes('src')).toBe(generated)
  expect(app.find('img[onerror]').exists()).toBe(false)
  await app.get('.result-actions button:first-child').trigger('click')
  expect(window.utools?.copyText).toHaveBeenCalledWith(source)
  await app.get('.result-actions button:last-child').trigger('click')
  expect(app.get('#qr-content').element).toHaveProperty('value', source)
})
it('宿主选中文本进入后可生成，主题偏好保存但内容不保存', async () => {
  enter({ code: 'text-qr', payload: 'hello' })
  await vi.advanceTimersByTimeAsync(250)
  expect(app.find('.qr-image').exists()).toBe(true)
  await app.get('.theme-button').trigger('click')
  await app.get('.theme-button').trigger('click')
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(Object.keys(localStorage)).toEqual(['funqr-theme'])
})

it('上传透明 Logo 时不填充白底，样式调整保留旧预览，且上传错误不被校验错误遮蔽', async () => {
  await generate()
  await app.get('#caption-text').setValue('扫码查看')
  expect(app.find('.qr-image').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(250)
  expect(app.find('.qr-image').exists()).toBe(true)

  const logoInput = app.get('input[aria-label="上传中心 Logo"]')
  const file = new File(['png'], 'logo.png', { type: 'image/png' })
  vi.mocked(imageCanvas).mockResolvedValueOnce({ toDataURL: () => generated } as unknown as HTMLCanvasElement)
  Object.defineProperty(logoInput.element, 'files', { value: [file], configurable: true })
  await logoInput.trigger('change')
  await vi.advanceTimersByTimeAsync(0)
  expect(imageCanvas).toHaveBeenCalledWith(file, 256, { fillBackground: false })

  await app.get('[aria-label="码点颜色"]').setValue('#ffffff')
  await vi.advanceTimersByTimeAsync(250)
  vi.mocked(imageCanvas).mockRejectedValueOnce(new Error('Logo 文件过大'))
  Object.defineProperty(logoInput.element, 'files', { value: [file], configurable: true })
  await logoInput.trigger('change')
  await vi.advanceTimersByTimeAsync(0)
  const alerts = app.findAll('[role="alert"]').map(node => node.text())
  expect(alerts).toEqual(expect.arrayContaining([expect.stringContaining('颜色太接近'), expect.stringContaining('Logo 文件过大')]))
})

it('识别页支持通过 clipboardData.items 粘贴图片，且截图前清除旧错误', async () => {
  enter({ code: 'decode' })
  await app.get('.scan-actions button:last-child').trigger('click')
  expect(app.get('.scanner [role="alert"]').text()).toContain('截图识别需在 uTools 中使用')
  window.utools!.screenCapture = vi.fn()
  await app.get('.scan-actions button:last-child').trigger('click')
  expect(app.find('.scanner [role="alert"]').exists()).toBe(false)

  const file = new File(['png'], 'paste.png', { type: 'image/png' })
  const pasteEvent = new Event('paste', { cancelable: true }) as ClipboardEvent
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
    },
  })
  window.dispatchEvent(pasteEvent)
  await vi.advanceTimersByTimeAsync(0)
  expect(decodeImage).toHaveBeenCalledWith(file, expect.any(AbortSignal))
  expect(app.get('#scan-output').element).toHaveProperty('value', 'hello')
  expect(app.get('.result-meta').text()).toContain('5 字节')
  await app.get('.clear-scan').trigger('click')
  expect(app.find('#scan-output').exists()).toBe(false)

  vi.mocked(decodeImage).mockRejectedValueOnce(new Error('没有发现二维码'))
  window.dispatchEvent(pasteEvent)
  await vi.advanceTimersByTimeAsync(0)
  expect(app.get('.empty-result.is-error').text()).toContain('未能识别二维码')
})
