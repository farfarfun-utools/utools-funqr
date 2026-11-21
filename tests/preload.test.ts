import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

function bridge() {
  const writeFileSync = vi.fn()
  const lstatSync = vi.fn(() => ({ isSymbolicLink: (): boolean => false, isFile: (): boolean => true, size: pngBytes.length }))
  const readImageSync = vi.fn(() => pngBytes)
  const showSaveDialog = vi.fn((): string | undefined => '/tmp/example.png')
  let pluginEnter: ((action: { code: string; payload?: unknown }) => void) | undefined
  const onPluginEnter = vi.fn((callback: (action: { code: string; payload?: unknown }) => void) => { pluginEnter = callback })
  const context = {
    window: {} as {
      funqr: {
        saveFile: (data: string, format: string) => boolean
        readImageFile: (path: string) => string
        onEnter: (callback: (action: { code: string; payload?: unknown }) => void) => () => void
      }
    },
    require: (name: string) => name === 'node:path' ? path : { writeFileSync, lstatSync, readFileSync: readImageSync },
    utools: { showSaveDialog, onPluginEnter },
    Buffer,
  }
  vm.runInNewContext(readFileSync(new URL('../utools/preload.js', import.meta.url), 'utf8'), context)
  return { ...context.window.funqr, writeFileSync, readImageSync, lstatSync, showSaveDialog, triggerEnter: (action: { code: string; payload?: unknown }) => pluginEnter?.(action) }
}

it('只读取受支持的本机图片，拒绝符号链接、魔数不符、无效路径和过大文件', () => {
  const native = bridge()
  const filename = path.resolve('code.png')
  expect(native.readImageFile(filename)).toBe(`data:image/png;base64,${pngBytes.toString('base64')}`)
  expect(native.readImageSync).toHaveBeenCalledWith(filename)
  expect(() => native.readImageFile('code.png')).toThrow('绝对路径')
  expect(() => native.readImageFile(path.resolve('code.svg'))).toThrow('只支持')
  native.lstatSync.mockReturnValueOnce({ isSymbolicLink: () => true, isFile: () => true, size: pngBytes.length })
  expect(() => native.readImageFile(filename)).toThrow('符号链接')
  native.lstatSync.mockReturnValueOnce({ isSymbolicLink: () => false, isFile: () => true, size: 20 * 1024 * 1024 + 1 })
  expect(() => native.readImageFile(filename)).toThrow('20 MB')
  native.readImageSync.mockReturnValueOnce(Buffer.from('not-an-image'))
  expect(() => native.readImageFile(filename)).toThrow('内容无效')
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

it('底层文件系统失败返回友好提示，不泄露原始路径', () => {
  const native = bridge()
  const noSpace = Object.assign(new Error('ENOSPC: /Users/secret/file'), { code: 'ENOSPC' })
  native.writeFileSync.mockImplementationOnce(() => { throw noSpace })
  expect(() => native.saveFile('hello', 'txt')).toThrow('磁盘空间不足')

  const denied = Object.assign(new Error('EACCES: /etc/shadow'), { code: 'EACCES' })
  native.lstatSync.mockImplementationOnce(() => { throw denied })
  let caught: Error | undefined
  try { native.readImageFile(path.resolve('code.png')) } catch (error) { caught = error as Error }
  expect(caught?.message).toContain('权限')
  expect(caught?.message).not.toContain('/etc/shadow')
})

it('缓存早期 onPluginEnter 事件并在订阅后立即投递，支持取消订阅', () => {
  const native = bridge()
  native.triggerEnter({ code: 'decode' })
  const received: { code: string; payload?: unknown }[] = []
  const unsubscribe = native.onEnter(action => received.push(action))
  expect(received).toEqual([{ code: 'decode' }])
  native.triggerEnter({ code: 'text-qr', payload: 'hi' })
  expect(received).toEqual([{ code: 'decode' }, { code: 'text-qr', payload: 'hi' }])
  unsubscribe()
  native.triggerEnter({ code: 'decode' })
  expect(received).toHaveLength(2)
})
