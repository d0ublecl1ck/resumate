// 设置分区 tab 切换的状态保留契约。
// 复现路径是应用内设置分区 tab（嵌套路由），不是浏览器 tab：
// 填写输入框 → 切到另一个分区 → 切回，输入不应被清空。

import { focusManager } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import App from "@/App"

// vitest 未开启 globals，testing-library 的自动清理不会注册，这里显式清理，避免用例间 DOM 叠加。
afterEach(cleanup)

function renderAt(path: string) {
  window.history.pushState({}, "", path)
  return render(<App />)
}

describe("设置分区 tab 切换", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/settings")
  })

  it("应用内切到另一个分区再切回时保留正在编辑的输入", async () => {
    renderAt("/settings")

    const displayName = await screen.findByLabelText("显示名称")
    fireEvent.change(displayName, { target: { value: "临时改名" } })
    expect(displayName).toHaveValue("临时改名")

    fireEvent.click(screen.getByRole("link", { name: "开放接入与审计" }))
    expect(await screen.findByText("公共接入能力")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("link", { name: "Agent 与偏好" }))

    await waitFor(() => expect(screen.getByLabelText("显示名称")).toHaveValue("临时改名"))
  })

  it("浏览器窗口重新聚焦触发的 refetch 不会把表单替换成加载占位", async () => {
    renderAt("/settings")

    const displayName = await screen.findByLabelText("显示名称")
    fireEvent.change(displayName, { target: { value: "聚焦保留" } })

    focusManager.setFocused(false)
    focusManager.setFocused(true)

    await waitFor(() => expect(screen.queryByText("加载中")).not.toBeInTheDocument())
    expect(screen.getByLabelText("显示名称")).toHaveValue("聚焦保留")
  })
})
