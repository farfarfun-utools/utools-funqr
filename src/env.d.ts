/// <reference types="vite/client" />

interface Window {
  funqr?: { saveFile(data: string, format: 'png' | 'svg' | 'txt'): boolean }
  utools?: {
    onPluginEnter(callback: (action: { code: string; payload?: unknown }) => void): void
    screenCapture?(callback: (image: string) => void): void
    copyText?(text: string): boolean
    copyImage?(image: string): boolean
    isDarkColors?(): boolean
  }
}
