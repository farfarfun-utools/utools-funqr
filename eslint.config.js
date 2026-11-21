import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['utools/dist/**', 'node_modules/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],

  // 渲染进程：浏览器环境，.vue 里的 <script lang="ts"> 交给 TS 解析器。
  {
    files: ['src/**/*.{ts,vue}', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },

  // preload 跑在 uTools 的 Node 侧：CommonJS，且 utools 由宿主注入到全局。
  {
    files: ['utools/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser, utools: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/attributes-order': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': ['warn', { html: { void: 'any', normal: 'any', component: 'always' } }],
      'eqeqeq': ['warn', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // 构建脚本和截图脚本跑在 Node 里，靠 stdout 汇报进度。
  {
    files: ['vite.config.ts', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
)
