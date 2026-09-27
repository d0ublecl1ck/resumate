// Storybook 屏幕辅助：为每个 story 注入隔离的 QueryClient 与 MemoryRouter，
// 直接用真实页面组件渲染界面，业务数据由 preview 的 MSW handlers 提供。
import { useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"

export type StorySeed = [readonly unknown[], unknown][]

/** 每个 story 独立缓存；seed 预置查询数据，未预置的查询按真实契约走 MSW。 */
export function StoryProviders({ seed = [], children }: { seed?: StorySeed; children: ReactNode }) {
  const [client] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    for (const [key, data] of seed) value.setQueryData(key, data)
    return value
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** 渲染一个带应用外壳的路由界面。 */
export function Screen({
  path,
  routePath = "*",
  seed,
  chrome = true,
  children,
}: {
  path: string
  routePath?: string
  seed?: StorySeed
  chrome?: boolean
  children: ReactNode
}) {
  const element = chrome ? <AppShell>{children}</AppShell> : children
  return (
    <StoryProviders seed={seed}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </StoryProviders>
  )
}
