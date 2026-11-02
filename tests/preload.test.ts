import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

function bridge() {
  const writeFileSync = vi.fn()
  const image = Buffer.from('image')
  const statSync = vi.fn(() => ({ isFile: () => true, size: image.length }))
  const readImageSync = vi.fn(() => image)
  const showSaveDialog = vi.fn((): string | undefined => '/tmp/example.png')
  const context = { window: {} as { funqr: { saveFile: (data: string, format: string) => boolean; readImageFile: (path: string) => string } }, require: (name: string) => name === 'node:path' ? path : { writeFileSync, statSync, readFileSync: readImageSync }, utools: { showSaveDialog }, Buffer }
  vm.runInNewContext(readFileSync(new URL('../utools/preload.js', import.meta.url), 'utf8'), context)
  return { ...context.window.funqr, writeFileSync, readImageSync, statSync, showSaveDialog }
}
it('只读取受支持的本机图片，拒绝无效路径和过大文件', () => {
  const native = bridge()
  const filename = path.resolve('code.png')
  expect(native.readImageFile(filename)).toBe('data:image/png;base64,aW1hZ2U=')
  expect(native.readImageSync).toHaveBeenCalledWith(filename)
  expect(() => native.readImageFile('code.png')).toThrow('绝对路径')
  expect(() => native.readImageFile(path.resolve('code.svg'))).toThrow('只支持')
  native.statSync.mockReturnValueOnce({ isFile: () => true, size: 20 * 1024 * 1024 + 1 })
  expect(() => native.readImageFile(filename)).toThrow('20 MB')
})
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
