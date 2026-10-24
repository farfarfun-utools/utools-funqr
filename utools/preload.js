const fs = require('node:fs')

window.funqr = {
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
