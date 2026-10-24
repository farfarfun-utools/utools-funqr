// @vitest-environment jsdom
/// <reference types="vitest/jsdom" />
import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import { decodeCanvas, decodeImage, rasterize } from '../src/lib/image'

vi.mock('../src/lib/image', () => ({
  IMAGE_TYPES: ['image/png'],
  rasterize: vi.fn(), decodeCanvas: vi.fn(), decodeImage: vi.fn(),
  clipboardImage: vi.fn(), imageCanvas: vi.fn(), saveBlob: vi.fn(),
}))
let app: VueWrapper
let enter: (action: { code: string; payload?: unknown }) => void
const generated = 'data:image/png;base64,dGVzdA=='
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.mocked(rasterize).mockResolvedValue({ toDataURL: () => generated } as unknown as HTMLCanvasElement)
  vi.mocked(decodeCanvas).mockResolvedValue('hello')
  vi.mocked(decodeImage).mockResolvedValue({ text: 'hello', preview: generated })
  window.utools = { onPluginEnter: callback => { enter = callback }, copyImage: vi.fn(() => true), copyText: vi.fn(() => true) }
  app = mount(App, { attachTo: document.body })
})
afterEach(() => { delete window.utools; delete window.funqr; vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks() })
async function generate(text = 'hello') {
  await app.get('#qr-content').setValue(text)
  await vi.advanceTimersByTimeAsync(250)
}

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
  window.funqr = { saveFile: vi.fn(() => false) }
  await app.get('.export-actions button').trigger('click')
  expect(app.find('.toast').exists()).toBe(false)
  window.funqr.saveFile = () => { throw new Error('磁盘空间不足') }
  await app.get('.export-actions button').trigger('click')
  expect(app.get('[role="alert"]').text()).toContain('磁盘空间不足')
})
it('识别结果可复制并转回生成页，原始文本不作为 HTML 执行', async () => {
  enter({ code: 'decode' })
  const source = '<img src=x onerror=alert(1)>'
  vi.mocked(decodeImage).mockResolvedValueOnce({ text: source, preview: generated })
  const input = app.get('input[aria-label="选择二维码图片"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['png'], 'test.png', { type: 'image/png' })] })
  await input.trigger('change')
  await vi.advanceTimersByTimeAsync(0)
  expect(app.get('#scan-output').element).toHaveProperty('value', source)
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
