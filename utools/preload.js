const fs = require('node:fs')
const path = require('node:path')

const MAX_BYTES = 20 * 1024 * 1024
const imageTypes = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif', '.bmp': 'bmp' }

let pendingEnter = null
let enterListener = null

if (typeof utools !== 'undefined' && typeof utools.onPluginEnter === 'function') {
  utools.onPluginEnter(action => {
    if (enterListener) enterListener(action)
    else pendingEnter = action
  })
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii')
    if (header === 'GIF87a' || header === 'GIF89a') return 'gif'
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp'
  return null
}

function formatFsError(error, action) {
  const code = error && typeof error === 'object' ? error.code : undefined
  if (code === 'ENOENT') return `${action}失败：文件或目录不存在`
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return `${action}失败：没有访问该位置的权限`
  if (code === 'ENOSPC') return `${action}失败：磁盘空间不足`
  return `${action}失败，请检查文件路径与磁盘空间`
}

window.funqr = {
  readImageFile(filename) {
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw new Error('请提供本机图片的绝对路径')
    const extType = imageTypes[path.extname(filename).toLowerCase()]
    if (!extType) throw new Error('只支持 PNG、JPG、WebP、GIF 或 BMP 图片')
    let stat
    try {
      stat = fs.lstatSync(filename)
    } catch (error) {
      throw new Error(formatFsError(error, '读取图片'))
    }
    if (stat.isSymbolicLink()) throw new Error('不支持读取符号链接图片')
    if (!stat.isFile() || !stat.size || stat.size > MAX_BYTES) throw new Error('图片必须是 20 MB 以内的非空文件')
    let data
    try {
      data = fs.readFileSync(filename)
    } catch (error) {
      throw new Error(formatFsError(error, '读取图片'))
    }
    if (!data.length || data.length > MAX_BYTES) throw new Error('图片必须是 20 MB 以内的非空文件')
    const detected = detectImageType(data)
    if (!detected) throw new Error('图片文件内容无效，仅支持 PNG、JPG、WebP、GIF 或 BMP 格式')
    return `data:image/${detected};base64,${data.toString('base64')}`
  },
  saveFile(data, format) {
    if (!['png', 'svg', 'txt'].includes(format) || typeof data !== 'string' || data.length > MAX_BYTES) throw new Error('导出内容无效或过大')
    if (format === 'png' && !/^data:image\/png;base64,[\da-z+/=]+$/i.test(data)) throw new Error('PNG 图片数据无效')
    const filename = utools.showSaveDialog({
      title: '保存码上生花作品', defaultPath: `FunQR.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (!filename) return false
    try {
      fs.writeFileSync(filename, format === 'png' ? Buffer.from(data.split(',')[1], 'base64') : data)
      return true
    } catch (error) {
      throw new Error(formatFsError(error, '保存文件'))
    }
  },
  onEnter(callback) {
    if (typeof callback !== 'function') throw new TypeError('onEnter 需要传入回调函数')
    enterListener = callback
    if (pendingEnter) {
      const action = pendingEnter
      pendingEnter = null
      callback(action)
    }
    return () => {
      if (enterListener === callback) enterListener = null
    }
  },
}
