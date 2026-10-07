import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AllStates, BusinessFailure, PersistedLastTest, Testing, TransportFailure } from "@/components/model-test-result.stories"

afterEach(cleanup)

describe("model test result stories", () => {
  it("Testing shows the testing hint", () => {
    render(Testing.render())
    expect(screen.getByText("测试中…")).toBeInTheDocument()
  })

  it("TransportFailure shows the transport failure copy", () => {
    render(TransportFailure.render())
    expect(screen.getByText("测试失败")).toBeInTheDocument()
  })

  it("BusinessFailure shows the backend message", () => {
    render(BusinessFailure.render())
    expect(screen.getByText("模型服务超时，请稍后重试")).toBeInTheDocument()
  })

  it("PersistedLastTest shows both the result message and the last-test time", () => {
    render(PersistedLastTest.render())
    expect(screen.getByText("连接成功，延迟 420ms")).toBeInTheDocument()
    expect(screen.getByText("· 上次测试：2026-09-19 20:00")).toBeInTheDocument()
  })

  it("AllStates covers all four rows", () => {
    render(AllStates.render())
    expect(screen.getByText("测试中…")).toBeInTheDocument()
    expect(screen.getByText("测试失败")).toBeInTheDocument()
    expect(screen.getByText("模型服务超时，请稍后重试")).toBeInTheDocument()
    expect(screen.getByText("· 上次测试：2026-09-19 20:00")).toBeInTheDocument()
  })
})
