import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DraftResult, InputReady, ModelNotConfigured, ParseRetryable, Parsing } from "@/components/create-jd-modal.stories"

afterEach(cleanup)

describe("create JD modal stories", () => {
  it("InputReady 渲染弹窗且可发起整理", () => {
    render(InputReady.render())
    expect(screen.getByRole("dialog", { name: "新增 JD" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeEnabled()
  })

  it("Parsing 按钮禁用并显示整理中", () => {
    render(Parsing.render())
    expect(screen.getByRole("button", { name: "整理中…" })).toBeDisabled()
  })

  it("DraftResult 展示可编辑草案与创建入口", () => {
    render(DraftResult.render())
    expect(screen.getByText("AI 整理结果（可编辑）")).toBeInTheDocument()
    expect(screen.getByDisplayValue("高级前端工程师")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重新整理" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "创建 JD" })).toBeInTheDocument()
  })

  it("ModelNotConfigured 就地引导去设置，不暴露机器码", () => {
    render(ModelNotConfigured.render())
    expect(screen.getByRole("alert")).toHaveTextContent("还没有配置模型，先去设置里选一个再整理。")
    expect(screen.getByRole("button", { name: "去设置模型" })).toBeInTheDocument()
    expect(screen.queryByText(/MODEL_NOT_CONFIGURED/)).not.toBeInTheDocument()
  })

  it("ParseRetryable 给可点重试", () => {
    render(ParseRetryable.render())
    expect(screen.getByRole("alert")).toHaveTextContent("解析超时，请重试。")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})
