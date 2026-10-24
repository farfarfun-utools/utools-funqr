import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'
import QRCode from 'qrcode'
import { launch, waitFor } from './cdp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs/screenshots')
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'funqr-downloads-'))
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'utools/plugin.json'), 'utf8'))
fs.mkdirSync(out, { recursive: true })
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false } })
let browser
try {
  browser = await launch({ url: server.resolvedUrls.local[0], downloadPath: downloads })
  const { session } = browser
  const errors = [], externalRequests = []
  session.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text))
  session.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') errors.push(entry.text) })
  session.on('Network.requestWillBeSent', ({ request }) => {
    if (/^https?:/.test(request.url) && new URL(request.url).hostname !== '127.0.0.1') externalRequests.push(request.url)
  })
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
  async function viewport(width, height = plugin.pluginSetting.height) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
  }
  async function click(selector) {
    await session.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    await session.evaluate('new Promise(resolve => requestAnimationFrame(resolve))')
  }
  async function setValue(selector, value) {
    await session.evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  }
  async function ready() {
    await session.waitForExpression('document.querySelector(".preview-state.ready") || document.querySelector(".generator .error-message")', { timeout: 25_000 })
    assert.equal(await session.evaluate('document.querySelector(".generator .error-message")?.textContent || ""'), '', '生成或反向识别失败')
    assert.equal(await session.evaluate('document.querySelector(".export-actions button").disabled'), false)
  }
  async function screenshot(name, full = false) {
    await session.evaluate('document.fonts.ready')
    assert.equal(await session.evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${name}: 横向溢出`)
    const { cssContentSize } = await session.send('Page.getLayoutMetrics')
    if (!full) assert.ok(cssContentSize.height <= plugin.pluginSetting.height, `${name}: 默认界面超出 ${plugin.pluginSetting.height}px，实际 ${cssContentSize.height}px`)
    const result = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } } : {}) })
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result.data, 'base64'))
    console.log(`${name}.png (${cssContentSize.width} × ${cssContentSize.height})`)
  }
  async function uploadData(selector, dataUrl, filename = 'qr.png') {
    await session.evaluate(`(async () => { const blob = await (await fetch(${JSON.stringify(dataUrl)})).blob(); const dt = new DataTransfer(); dt.items.add(new File([blob], ${JSON.stringify(filename)}, { type: blob.type })); const input = document.querySelector(${JSON.stringify(selector)}); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  }
  const demo = '生活的小确幸，值得分享。\nhttps://farfarfun.github.io'
  await viewport(800)
  await browser.navigate()
  await session.waitForExpression('document.querySelector("#qr-content")')
  assert.equal(await session.evaluate('document.querySelector(".export-actions button").disabled'), true)
  await setValue('#qr-content', demo)
  await ready()
  await screenshot('home')
  const png = await session.evaluate('document.querySelector(".qr-image").src')
  await click('.export-actions button:first-child')
  const pngFile = path.join(downloads, 'FunQR-1024.png')
  await waitFor(() => fs.existsSync(pngFile), { label: 'PNG 下载' })
  const pngBytes = fs.readFileSync(pngFile)
  assert.equal(pngBytes.subarray(1, 4).toString(), 'PNG')
  assert.equal(pngBytes.readUInt32BE(16), 1024)
  await click('.svg-export')
  const svgFile = path.join(downloads, 'FunQR-1024.svg')
  await waitFor(() => fs.existsSync(svgFile), { label: 'SVG 下载' })
  assert.ok(fs.readFileSync(svgFile, 'utf8').startsWith('<svg'))

  // 真浏览器校验每个预设和码点，不用测试替身代替扫码。
  for (let preset = 1; preset <= 6; preset++) {
    await click(`.presets button:nth-child(${preset})`)
    for (let shape = 1; shape <= 3; shape++) { await click(`.shape-options button:nth-child(${shape})`); await ready() }
  }
  await click('.presets button:nth-child(2)')
  await click('.gradient-toggle input')
  await ready()
  const logo = `data:image/png;base64,${fs.readFileSync(path.join(root, 'utools/logo.png')).toString('base64')}`
  await uploadData('[aria-label="上传中心 Logo"]', logo, 'logo.png')
  await session.waitForExpression(`document.querySelector('[aria-label="移除 Logo"]') !== null`)
  await ready()
  await session.waitForExpression('document.querySelector(".toast") === null')
  await screenshot('styled')
  await click('.theme-button'); await click('.theme-button')
  await screenshot('dark')
  await click('.theme-button')
  await viewport(375, 812)
  await screenshot('mobile', true)
  await viewport(800)

  await click('.view-switch button:last-child')
  await uploadData('input[aria-label="选择二维码图片"]', png)
  await session.waitForExpression('document.querySelector("#scan-output")')
  assert.equal(await session.evaluate('document.querySelector("#scan-output").value'), demo)
  await screenshot('scan')
  await click('.result-actions button:last-child')
  assert.equal(await session.evaluate('document.querySelector("#qr-content").value'), demo)

  await click('[aria-label="移除 Logo"]')
  await click('.gradient-toggle input')
  await click('.shape-options button:first-child')
  for (const text of ['hello', ' \n ', '<script>alert(1)</script> 😀', '码'.repeat(400)]) {
    console.log(`检查文本：${Buffer.byteLength(text)} 字节，${text.slice(0, 12)}`)
    await setValue('#qr-content', text)
    await ready()
  }
  await setValue('#qr-content', demo); await ready()
  for (const size of [512, 2048, 1024]) { await setValue('#export-size', size); await ready() }
  await setValue('#qr-content', 'a'.repeat(1201))
  await session.waitForExpression('document.querySelector(".generator .error-message")')
  assert.equal(await session.evaluate('document.querySelector(".export-actions button").disabled'), true)
  await setValue('#qr-content', demo); await ready()
  await setValue('[aria-label="码点颜色"]', '#ffffff')
  await session.waitForExpression('document.querySelector(".generator .error-message")')
  assert.equal(await session.evaluate('document.querySelector(".export-actions button").disabled'), true)

  await click('.view-switch button:last-child')
  const independentText = '独立图片 / 中文 / Emoji 🌸\nhttps://example.com/?a=1&b=2'
  const independentPng = await QRCode.toDataURL(independentText, { width: 1200, margin: 4 })
  await uploadData('input[aria-label="选择二维码图片"]', independentPng)
  await session.waitForExpression('document.querySelector("#scan-output")')
  assert.equal(await session.evaluate('document.querySelector("#scan-output").value'), independentText)
  const blank = await session.evaluate(`(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 100, 100); return canvas.toDataURL(); })()`)
  await uploadData('input[aria-label="选择二维码图片"]', blank)
  await session.waitForExpression('document.querySelector(".scanner .error-message")')
  assert.equal(await session.evaluate('document.querySelector("#scan-output") === null'), true)
  assert.deepEqual(errors, [], '浏览器错误')
  assert.deepEqual(externalRequests, [], '不应请求外部资源')
  console.log('浏览器检查通过：18 组配色/码点、渐变/Logo、UTF-8 上限、实际 PNG/SVG 导出、扫码回填、错误反馈与离线运行。')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
  fs.rmSync(downloads, { recursive: true, force: true })
}
