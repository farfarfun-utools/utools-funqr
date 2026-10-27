<p align="center"><img src="utools/logo.png" width="88" alt="码上生花"></p>
<h1 align="center">码上生花 · FunQR</h1>
<p align="center">小小方寸，大有心意。离线二维码识别、文本互转与美化。</p>
<p align="center"><a href="https://farfarfun.github.io/packages/utools-funqr/">产品主页</a> · <a href="https://github.com/farfarfun-utools/utools-funqr/actions">构建与截图</a> · <a href="https://github.com/farfarfun-utools/utools-funqr/issues">反馈问题</a> · <a href="https://github.com/farfarfun-utools/utools-plugins">更多插件</a></p>

![生成二维码](docs/screenshots/home.png)

## UPXS 安装与发布

从 [v1.0.1 Release](https://github.com/farfarfun-utools/utools-funqr/releases/tag/v1.0.1) 下载 `utools-funqr-1.0.1.upxs`，导入 uTools 使用。也可在成功的 CI 中下载 `utools-funqr-upxs` 附件。打包链路已由用户在 FunCalc 上验证；本插件的实机安装与功能仍需分别确认。

项目根目录 [`identity.json`](identity.json) 明文维护官方项目 ID `zqqonl7o`。`mid`、`uid`、`cellphone` 由 `farfarfun-utools` 组织的 `UTOOLS_MID`、`UTOOLS_UID`、`UTOOLS_CELLPHONE` Secrets 注入，不写入公开配置。CI 和 Release 统一调用固定版本的 [utools-devtools](https://github.com/farfarfun-action/utools-devtools)，生成 `.upxs` 与 `SHA256SUMS`，PR 不执行身份打包。

## 能做什么

- **文本 → 二维码**：输入文字、网址、中文或 Emoji，即时预览；保留原始空格与换行。
- **二维码 → 文本**：选择图片、拖入图片、粘贴剪贴板图片，或使用 uTools 截图识别；可复制、保存 TXT，或继续生成新的二维码。
- **二维码美化**：六套配色，方块 / 圆角 / 圆点，双色渐变、自定义前景与背景、中心 Logo。
- **清晰导出**：512 / 1024 / 2048 px PNG、SVG 矢量图，以及一键复制图片；无水印。
- **日夜皆宜**：暖白与紫藤色界面，支持浅色、深色、跟随系统，适配窄窗口。
- **完全离线**：生成与识别都在本机完成，无账号、无上传、无远程字体，不保存内容历史，仅保存主题偏好。

生成使用 [qrcode](https://github.com/soldair/node-qrcode)，识别使用 [jsQR](https://github.com/cozmo/jsQR)。扫码在独立 Worker 内运行，支持取消和超时。生成使用 H 级纠错、四模块静区，并保留定位和校正模块的原形；配色需满足对比度要求。每次生成后会实际反向识别，并与原文逐字核对，通过后才允许导出。

## 界面

| 美化与 Logo | 识别与文本互转 |
| --- | --- |
| ![美化二维码](docs/screenshots/styled.png) | ![识别二维码](docs/screenshots/scan.png) |

<details><summary>查看深色与窄屏界面</summary>

![深色模式](docs/screenshots/dark.png)
<img src="docs/screenshots/mobile.png" width="360" alt="窄屏布局">

</details>

截图来自实际构建后的界面。GitHub Actions 会运行浏览器检查、重新截图，并在图片有变化时自动提交。

## 安装与使用

当前提供源码构建和 CI 构建产物，尚未发布正式 UPX 安装包或上架插件市场。

需要 **Node.js ≥ 22.22.2**，pnpm 版本见 `package.json#packageManager`。

```bash
git clone https://github.com/farfarfun-utools/utools-funqr.git
cd utools-funqr
pnpm install
sh build.sh
```

在 uTools 的开发者工具中新建项目，选择 `utools/plugin.json`。构建产物位于 `utools/dist`，安装时保留同目录的 `plugin.json`、`preload.js` 和 `logo.png`。

| 入口 | 操作 |
| --- | --- |
| `码上生花` / `FunQR` / `二维码` / `生成二维码` / `文本转二维码` | 进入生成与美化界面 |
| `识别二维码` / `二维码识别` / `扫码` / `二维码转文本` | 进入图片识别界面 |
| 选中文字后使用「生成二维码」 | 自动填入文字并生成 |
| 在识别页按 Ctrl / ⌘ + V | 粘贴二维码图片 |

也可以运行 `pnpm dev` 在浏览器中使用。截图识别需要 uTools；浏览器剪贴板能力取决于权限，可使用文件选择和下载替代。

## 范围与限制

- 单次生成最多 **1200 UTF-8 字节**，汉字通常占 3 字节。内容越长码点越密，建议增大导出尺寸并使用方块样式。
- 识别 PNG、JPEG、WebP、GIF、BMP；最大 **20 MB / 2400 万像素**，处理时最长边缩放至 2048 px。GIF 只处理静态首帧，每次返回一个二维码；复杂图片请先裁剪到二维码附近。
- Logo 会遮挡部分信息。若当前样式无法通过识别校验，插件会提示调整；本机校验不等于所有扫码器都能识别，印刷前请用实际设备试扫。
- 识别结果只作为文本展示，不自动打开链接或执行内容。内容会保留在当前会话中供互转，关闭插件进程后丢弃；下载、复制的内容由用户自行管理。
- 当前处理文本二维码，不提供条形码、摄像头连续扫描、批量识别或内容历史。

## 开发与检查

```bash
pnpm dev          # 本地开发
pnpm typecheck    # Vue / TypeScript 类型检查
pnpm test         # 内容校验、交互、保存桥接测试
pnpm screenshots  # 构建、真实浏览器扫码与导出检查、截图
sh build.sh       # 安装锁定依赖、类型检查、测试、构建、插件文件检查
```

截图需要 Chrome / Chromium，可通过 `CHROME_PATH` 指定。浏览器检查覆盖配色与码点组合、渐变 / Logo、中文 / Emoji / 空白 / 长文本、实际 PNG / SVG 导出、识别回填、无二维码提示、窗口适配和无外部请求。CI 同时运行 Node.js 22 / 24，并启用 Node Web Storage 重跑测试，避免浏览器存储被 Node 同名全局变量覆盖。

技术栈：Vue 3、TypeScript、Vite、qrcode、jsQR、Vitest。按 uTools Chromium 132 构建，原生截图、剪贴板和保存对话框仍需在实际 uTools 环境验收。

## 许可

[MIT](LICENSE) · [farfarfun-utools](https://github.com/farfarfun-utools)
