import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  it("展示内置角色与权限目录", async () => {
    renderPage()

    expect(await screen.findByText("super_admin")).toBeInTheDocument()
    expect(screen.getByText("role:write")).toBeInTheDocument()
  })

  it("新建自定义角色后关闭弹窗", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /新建角色/ }))

    fireEvent.change(screen.getByLabelText(/编码/), { target: { value: "reviewer" } })
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: "审核员" } })
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
