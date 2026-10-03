import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Default, NoPublishedTemplate, NoSourceResume } from "@/components/create-resume-modal.stories"

afterEach(cleanup)

describe("create resume modal stories", () => {
  it("Default 渲染弹窗本体，滚动容器就是弹窗自身（max-h + overflow-auto）", () => {
    render(Default.render())
    const dialog = screen.getByRole("dialog", { name: "开始一份新的简历" })
    // 全局滚动条样式只对可滚动容器可见，弹窗自身必须是那个容器。
    expect(dialog.className).toContain("overflow-auto")
    expect(dialog.className).toContain("max-h-[88vh]")
    expect(screen.getByRole("button", { name: /从现有简历复制/ })).toHaveAttribute("aria-pressed", "true")
  })

  it("Default 点创建后进入选择层，而不是直接创建", () => {
    render(Default.render())
    fireEvent.click(screen.getByRole("button", { name: "创建" }))
    expect(screen.getByRole("dialog", { name: "选择要复制的简历" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "开始一份新的简历" })).not.toBeInTheDocument()
  })

  it("NoSourceResume 说明没有可复制的简历并落到完全新开", () => {
    render(NoSourceResume.render())
    expect(screen.getByRole("button", { name: /从现有简历复制/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /完全新开/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("还没有可复制的简历，先完全新开一份。")).toBeInTheDocument()
  })

  it("NoPublishedTemplate 说明没有已发布模板", () => {
    render(NoPublishedTemplate.render())
    expect(screen.getByRole("button", { name: /完全新开/ })).toBeDisabled()
    expect(screen.getByText(/没有已发布的模板/)).toBeInTheDocument()
  })
})
