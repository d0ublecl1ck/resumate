import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import App from "./App"

// vitest 未开启 globals，testing-library 的自动清理不会注册，这里显式清理，避免用例间 DOM 叠加。
afterEach(cleanup)

function renderAt(path: string) {
  window.history.pushState({}, "", path)
  return render(<App />)
}

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/")
  })

  it("渲染应用外壳与主导航", async () => {
    renderAt("/")
    expect((await screen.findAllByRole("navigation", { name: "主导航" })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: /简历库/ }).length).toBeGreaterThan(0)
  })

  it("工作台加载后显示首页标题", async () => {
    renderAt("/")
    expect(await screen.findByRole("heading", { name: /AI 全程陪跑/ })).toBeInTheDocument()
  })

  it("当前路由对应的导航项带 aria-current=page", async () => {
    renderAt("/resumes")
    const current = await screen.findAllByRole("link", { current: "page" })
    expect(current[0]).toHaveAccessibleName(/简历库/)
  })

  it("忘记密码路由在未登录时可达", async () => {
    renderAt("/forgot-password")
    expect(await screen.findByText("找回密码")).toBeInTheDocument()
  })

  it("重置密码路由在缺少 token 时展示失效态", async () => {
    renderAt("/reset-password")
    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
  })

  it("未知路由显示 404 状态块", async () => {
    renderAt("/not-a-route")
    expect(await screen.findByText("未找到该页面")).toBeInTheDocument()
  })

  it("窄屏导航可展开并暴露主导航链接", async () => {
    renderAt("/")
    const toggle = await screen.findByRole("button", { name: "打开菜单" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)

    expect(screen.getByRole("button", { name: "关闭菜单" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByRole("navigation", { name: "主导航" }).length).toBeGreaterThanOrEqual(2)
  })

  it("主导航链接可聚焦", async () => {
    renderAt("/")
    const links = await screen.findAllByRole("link", { name: /工作台/ })
    links[0].focus()
    expect(links[0]).toHaveFocus()
  })

  it("不存在的简历显示 404 状态块", async () => {
    renderAt("/resumes/does_not_exist")
    expect(await screen.findByText("未找到该简历")).toBeInTheDocument()
  })
})

// v0 导出的 12 条路由逐条冒烟：外壳渲染成功且数据加载完成后不再停留在 loading 占位。
const ROUTES = [
  "/",
  "/resumes",
  "/resumes/res_fe_lead",
  "/resumes/res_fe_lead/versions",
  "/jds",
  "/jds/jd_bytedance",
  "/profile",
  "/settings",
  "/settings/backup",
  "/settings/access",
  "/admin/templates",
  "/admin/templates/tpl_modern",
  "/admin/rbac",
]

describe("路由冒烟", () => {
  afterEach(cleanup)

  it.each(ROUTES)("%s 可渲染且加载完成", async (path) => {
    renderAt(path)
    expect((await screen.findAllByRole("navigation", { name: "主导航" })).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText("加载中")).not.toBeInTheDocument())
  })
})
