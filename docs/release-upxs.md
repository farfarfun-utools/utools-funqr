码上生花 UPXS 正式版，官方插件项目 ID：`zqqonl7o`。

本版新增 `generate_qr_png` 和 `decode_qr_image` AI/MCP 工具，可离线生成二维码 PNG，或从图片 Data URL、本机文件识别二维码原文。

下载 `utools-funqr-1.0.2.upxs` 后导入 uTools。此包通过 GitHub Actions 构建，使用统一的 `utools-devtools` 生成，并完成认证解密、清单资源、插件 ID 和 ASAR 完整性校验；提供 `SHA256SUMS` 核对下载文件。

三个敏感字段由组织 Secrets 注入，仓库只保存公开的项目配置。相同打包链路已由用户在 FunCalc 上实机安装验证；本插件自身的安装和功能仍待实机确认。
