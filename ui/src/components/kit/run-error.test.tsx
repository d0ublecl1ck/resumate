// 共享运行错误块：字段齐全、入口可跳设置、且界面只出现后端已脱敏的文案（issue 4ff97）。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RunErrorBlock } from "@/components/kit/run-error"
import type { RunError } from "@/lib/types"

afterEach(() => cleanup())

const AUTH_ERROR: RunError = {
  code: "MODEL_ERROR",
  category: "auth",
  message: "model provider returned HTTP 401: Authentication Fails, Your api key: ****be21 is invalid",
  provider: "deepseek",
  model: "deepseek-flash",
  keyHint: "****be21",
}

/** MemoryRouter 里读当前路径：验证「去设置更新 Key」真的跳到 /settings。 */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="probe-path">{location.pathname}</span>
}

function renderBlock(error: RunError, onRetry?: () => void) {
  return render(
    <MemoryRouter initialEntries={["/resumes/res_1"]}>
      <RunErrorBlock error={error} onRetry={onRetry} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe("RunErrorBlock", () => {
  it("renders category, provider/model, masked key tail and the upstream message", () => {
    renderBlock(AUTH_ERROR)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText(/模型鉴权失败/)).toBeInTheDocument()
    expect(screen.getByText(/deepseek \/ deepseek-flash/)).toBeInTheDocument()
    expect(screen.getByText(/出问题的 Key：\*\*\*\*be21/)).toBeInTheDocument()
    expect(screen.getByText(/401/)).toBeInTheDocument()
  })

  it("sends the user to settings so the wrong key can be replaced", () => {
    renderBlock(AUTH_ERROR)

    fireEvent.click(screen.getByRole("button", { name: "去设置更新 Key" }))

    expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings")
  })

  it("shows retry only when a retry handler is provided", () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <RunErrorBlock error={AUTH_ERROR} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <RunErrorBlock error={AUTH_ERROR} onRetry={onRetry} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("never renders a complete key, an Authorization header or a stack", () => {
    // 后端只送已脱敏字段；这里做前端侧的负向兜底断言。
    renderBlock(AUTH_ERROR)

    const text = screen.getByRole("alert").textContent ?? ""
    expect(text).not.toContain("sk-live")
    expect(text).not.toContain("Authorization")
    expect(text).not.toContain("Traceback")
    expect(text).toContain("****be21")
  })

  it("falls back to explicit copy when provider, model or key tail are missing", () => {
    renderBlock({ code: "RUNNER_EXIT", category: "runner", message: "", provider: null, model: null, keyHint: null })

    expect(screen.getByText(/运行体异常/)).toBeInTheDocument()
    expect(screen.getByText("Provider / 模型：未记录")).toBeInTheDocument()
    expect(screen.getByText("出问题的 Key：未记录")).toBeInTheDocument()
  })
})
