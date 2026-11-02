const fs = require('node:fs')
const path = require('node:path')

const imageTypes = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif', '.bmp': 'bmp' }

window.funqr = {
  readImageFile(filename) {
    if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw new Error('请提供本机图片的绝对路径')
    const type = imageTypes[path.extname(filename).toLowerCase()]
    if (!type) throw new Error('只支持 PNG、JPG、WebP、GIF 或 BMP 图片')
    const stat = fs.statSync(filename)
    if (!stat.isFile() || !stat.size || stat.size > 20 * 1024 * 1024) throw new Error('图片必须是 20 MB 以内的非空文件')
    return `data:image/${type};base64,${fs.readFileSync(filename).toString('base64')}`
  },
  saveFile(data, format) {
    if (!['png', 'svg', 'txt'].includes(format) || typeof data !== 'string' || data.length > 20 * 1024 * 1024) throw new Error('导出内容无效或过大')
    if (format === 'png' && !/^data:image\/png;base64,[\da-z+/=]+$/i.test(data)) throw new Error('PNG 图片数据无效')
    const filename = utools.showSaveDialog({
      title: '保存码上生花作品', defaultPath: `FunQR.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (!filename) return false
    fs.writeFileSync(filename, format === 'png' ? Buffer.from(data.split(',')[1], 'base64') : data)
    return true
  },
}
