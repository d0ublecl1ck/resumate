import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RbacPage } from "@/pages/rbac"

afterEach(cleanup)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RbacPage />
    </QueryClientProvider>,
  )
}

describe("RbacPage", () => {
  it("左树右表展示角色与只读权限目录", async () => {
    renderPage()

    expect(await screen.findByRole("tree", { name: "角色树" })).toBeInTheDocument()
    expect(await screen.findByText("super_admin")).toBeInTheDocument()
    expect(await screen.findByRole("tree", { name: "权限树" })).toBeInTheDocument()
    expect(await screen.findByText("role:write")).toBeInTheDocument()
    // 默认选中的是系统角色：只读提示可见，且权限勾选框禁用。
    expect(screen.getByText("系统内置角色由代码目录维护，只读。")).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox").every((box) => (box as HTMLInputElement).disabled)).toBe(true)
    // 权限码与端点绑定，界面不提供在线新建权限。
    expect(screen.queryByRole("button", { name: /新建权限/ })).not.toBeInTheDocument()
  })

  it("新建角色时右侧出现可勾选权限树", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /新建角色/ }))

    expect(await screen.findByText("resume:read")).toBeInTheDocument()
    expect(screen.getAllByRole("checkbox").some((box) => !(box as HTMLInputElement).disabled)).toBe(true)
    expect(screen.queryByText("系统内置角色由代码目录维护，只读。")).not.toBeInTheDocument()
  })

  it("点击角色树切换右侧角色", async () => {
    renderPage()

    fireEvent.click(await screen.findByText("超级管理员"))

    expect(await screen.findByRole("heading", { name: "超级管理员" })).toBeInTheDocument()
  })

  it("新建自定义角色后右侧显示该角色", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /新建角色/ }))

    fireEvent.change(screen.getByLabelText(/编码/), { target: { value: "reviewer" } })
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: "审核员" } })
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    expect(await screen.findByRole("heading", { name: "审核员" })).toBeInTheDocument()
  })
})
