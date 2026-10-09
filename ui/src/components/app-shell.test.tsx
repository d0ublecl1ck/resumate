// 外壳宽度契约：工作区型页面吃满可用宽度，阅读/表单型保留可读性上限。
// 缺陷复现：所有路由共用同一条 main（max-w-6xl），浏览器缩放到 70% 让 CSS 视口变宽时，
// 工作区页面两侧留出大片死区。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"

import App from "@/App"
import { AppShell, SHELL_WIDTH } from "@/components/app-shell"

afterEach(cleanup)

const MAX_READABLE = "max-w-6xl"

function renderShell(width?: "fluid" | "readable") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <AppShell width={width}>
          <p>内容</p>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mainOf(): HTMLElement {
  const main = document.querySelector("main")
  if (!main) throw new Error("找不到 main")
  return main
}

async function renderAppAt(path: string) {
  window.history.pushState({}, "", path)
  render(<App />)
  await waitFor(() => expect(document.querySelector("main")).not.toBeNull())
  return mainOf()
}

describe("AppShell 宽度档位", () => {
  it("fluid 档位不设宽度上限，也不居中", () => {
    renderShell("fluid")
    const main = mainOf()
    expect(main.className).toContain("w-full")
    expect(main.className).not.toContain(MAX_READABLE)
    expect(main.className).not.toContain("mx-auto")
  })

  it("未声明时默认 readable，保留 1152px 上限并居中", () => {
    renderShell()
    const main = mainOf()
    expect(main.className).toContain(MAX_READABLE)
    expect(main.className).toContain("mx-auto")
  })

  it("宽度契约是单一出处：两档都从 SHELL_WIDTH 取类名", () => {
    expect(SHELL_WIDTH.fluid).toBe("w-full")
    expect(SHELL_WIDTH.readable).toBe("mx-auto w-full max-w-6xl")
  })
})

describe("路由宽度分类", () => {
  it("简历编辑器（工作区）吃满宽度", async () => {
    const main = await renderAppAt("/resumes/res_pm_pivot")
    expect(main.className).not.toContain(MAX_READABLE)
  })

  it("设置页（阅读/表单）保留可读上限", async () => {
    const main = await renderAppAt("/settings")
    expect(main.className).toContain(MAX_READABLE)
    expect(main.className).toContain("mx-auto")
  })

  it("版本历史（阅读）保留可读上限", async () => {
    const main = await renderAppAt("/resumes/res_pm_pivot/versions")
    expect(main.className).toContain(MAX_READABLE)
  })
})
