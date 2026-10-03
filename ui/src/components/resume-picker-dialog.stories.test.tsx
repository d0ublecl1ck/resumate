import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Default, Empty, Failed, Submitting } from "@/components/resume-picker-dialog.stories"

afterEach(cleanup)

describe("resume picker stories", () => {
  it("Default 用网格列出活跃简历，未选中时确认按钮禁用", () => {
    render(Default.render())
    expect(screen.getByRole("dialog", { name: "选择要复制的简历" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /高级前端工程师简历/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /产品经理转型简历/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /实习生简历/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "创建副本" })).toBeDisabled()
  })

  it("Empty 说明没有可复制的简历", () => {
    render(Empty.render())
    expect(screen.getByText("还没有可复制的简历。")).toBeInTheDocument()
  })

  it("Submitting 显示加载态并禁用确认", () => {
    render(Submitting.render())
    expect(screen.getByRole("button", { name: "创建中…" })).toBeDisabled()
  })

  it("Failed 就地展示失败原因，已选来源可重试", () => {
    render(Failed.render())
    expect(screen.getByRole("alert")).toHaveTextContent("选中的原简历已不存在，请刷新后重试。")
    expect(screen.getByRole("button", { name: "创建副本" })).toBeEnabled()
  })
})
