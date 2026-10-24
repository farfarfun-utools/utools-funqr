import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

function bridge() {
  const writeFileSync = vi.fn()
  const showSaveDialog = vi.fn((): string | undefined => '/tmp/example.png')
  const context = { window: {} as { funqr: { saveFile: (data: string, format: string) => boolean } }, require: () => ({ writeFileSync }), utools: { showSaveDialog }, Buffer }
  vm.runInNewContext(readFileSync(new URL('../utools/preload.js', import.meta.url), 'utf8'), context)
  return { ...context.window.funqr, writeFileSync, showSaveDialog }
}
it('保存用户选择的路径，并正确解码 PNG；取消时不写文件', () => {
  const native = bridge()
  expect(native.saveFile('data:image/png;base64,aGVsbG8=', 'png')).toBe(true)
  expect(native.writeFileSync).toHaveBeenCalledWith('/tmp/example.png', Buffer.from('hello'))
  native.writeFileSync.mockClear()
  native.showSaveDialog.mockReturnValueOnce(undefined)
  expect(native.saveFile('hello', 'txt')).toBe(false)
  expect(native.writeFileSync).not.toHaveBeenCalled()
})
it('无效格式与内容不能进入文件保存流程', () => {
  const native = bridge()
  expect(() => native.saveFile('hello', 'exe')).toThrow('无效')
  expect(() => native.saveFile('hello', 'png')).toThrow('PNG')
  expect(() => native.saveFile('a'.repeat(20 * 1024 * 1024 + 1), 'txt')).toThrow('过大')
  expect(native.showSaveDialog).not.toHaveBeenCalled()
})
it('底层写入失败向界面传递错误', () => {
  const native = bridge()
  native.writeFileSync.mockImplementationOnce(() => { throw new Error('disk full') })
  expect(() => native.saveFile('hello', 'txt')).toThrow('disk full')
})
