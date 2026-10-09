import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// 代理目标可用 API_PROXY_TARGET 覆盖，便于联调非默认端口的后端。
// https://vite.dev/config/
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'
const projectRoot = path.resolve(import.meta.dirname, '..')

/**
 * Vite 对 /@fs 请求做真实路径校验：当 node_modules 是指向另一份工作副本的软链时
 * （git worktree 共享依赖），只放行项目根会把软链目标判为越界并返回 403，
 * 表现为 @fontsource 字体加载失败。这里基于项目内相对路径推导真实目录，
 * 不写死任何绝对路径；候选目录不存在时只保留原始路径，交给 Vite 处理。
 */
function withRealPaths(...candidates: string[]): string[] {
  const resolved: string[] = []
  for (const candidate of candidates) {
    resolved.push(candidate)
    try {
      resolved.push(fs.realpathSync(candidate))
    } catch {
      // 目录不存在：保留候选路径即可。
    }
  }
  return resolved
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // 放行项目根与依赖的真实目录（含软链目标），避免 /@fs 请求被 403。
    fs: {
      allow: [
        projectRoot,
        ...withRealPaths(path.resolve(projectRoot, 'node_modules'), path.resolve(import.meta.dirname, 'node_modules')),
      ],
    },
    // 开发代理：前端请求 /api/*，转发到本地 FastAPI（默认 http://localhost:8000）。
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
