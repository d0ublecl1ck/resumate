import type { Preview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, useState, type ReactNode } from "react"
import "../src/index.css"
import "@/i18n"
import { worker } from "@/mocks/browser"

// 预览数据统一由 MSW 提供，与 Vitest 共用同一份 handlers，避免 story 复制业务数据。
// 未匹配的请求直接放行，保证 Storybook 自身资源不受影响。
let workerStarted: Promise<unknown> | null = null
function ensureWorker() {
  workerStarted ??= worker.start({ onUnhandledRequest: "bypass", quiet: true })
  return workerStarted
}

export async function beforeAll() {
  await ensureWorker()
}

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }),
  )
  return createElement(QueryClientProvider, { client }, children)
}

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  decorators: [(Story) => createElement(Providers, null, createElement(Story))],
}

export default preview
