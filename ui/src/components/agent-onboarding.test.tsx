import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AgentAvailabilityNotice,
  agentAvailability,
  agentAvailabilityActionEffect,
  maskedCredentialTail,
} from "@/components/agent-onboarding"

afterEach(cleanup)

describe("agentAvailability", () => {
  it("任一查询仍在加载时是 checking，不提前下结论", () => {
    expect(agentAvailability({ model: { isPending: true }, runtime: { isPending: true } })).toBe("checking")
    expect(agentAvailability({ model: { keyConfigured: false, isPending: false }, runtime: { isPending: true } })).toBe("checking")
  })

  it("模型配置读取失败（非权限）是 load_failed，不误判为未配置", () => {
    expect(agentAvailability({ model: { isPending: false, errorCode: "RATE_LIMITED" }, runtime: { isPending: false } })).toBe("load_failed")
    expect(agentAvailability({ model: { isPending: false, errorCode: "NETWORK_ERROR" }, runtime: { isPending: false } })).toBe("load_failed")
  })

  it("模型配置无权读取是 forbidden，而不是 load_failed", () => {
    for (const code of ["FORBIDDEN", "SCOPE_INSUFFICIENT", "ACCOUNT_BANNED", "UNAUTHENTICATED"]) {
      expect(agentAvailability({ model: { isPending: false, errorCode: code }, runtime: { isPending: false } })).toBe("forbidden")
    }
  })

  it("数据到手但未配置密钥时是 model_missing，与运行体是否就绪无关", () => {
    expect(agentAvailability({ model: { keyConfigured: false, isPending: false }, runtime: { available: true, isPending: false } })).toBe("model_missing")
  })

  it("已配置但后端无法启动运行体时是 runtime_offline", () => {
    expect(agentAvailability({ model: { keyConfigured: true, isPending: false }, runtime: { available: false, isPending: false } })).toBe("runtime_offline")
    expect(agentAvailability({ model: { keyConfigured: true, isPending: false }, runtime: { isPending: false } })).toBe("runtime_offline")
  })

  it("已配置且后端可在需要时启动运行体时是 available", () => {
    expect(agentAvailability({ model: { keyConfigured: true, isPending: false }, runtime: { available: true, isPending: false } })).toBe("available")
  })
})

describe("agentAvailability · 凭据被拒", () => {
  it("配了 key 但上次测试被上游拒绝时是 auth_failed，不再当成可用", () => {
    expect(
      agentAvailability({
        model: { isPending: false, keyConfigured: true, lastTest: { ok: false, message: "401 api key ****be21 is invalid" } },
        runtime: { isPending: false, available: true },
      }),
    ).toBe("auth_failed")
  })

  it("模型配置查询直接返回凭据类机器码时也是 auth_failed", () => {
    for (const code of ["MODEL_AUTH", "MODEL_AUTH_FAILED", "UNAUTHORIZED", "INVALID_API_KEY"]) {
      expect(agentAvailability({ model: { isPending: false, errorCode: code }, runtime: { isPending: false } })).toBe("auth_failed")
    }
  })

  it("非凭据原因的测试失败不改判可用性，仍由运行体决定", () => {
    expect(
      agentAvailability({
        model: { isPending: false, keyConfigured: true, lastTest: { ok: false, message: "connection timed out" } },
        runtime: { isPending: false, available: true },
      }),
    ).toBe("available")
  })

  it("没配 key 优先于凭据失败：先回 model_missing", () => {
    expect(
      agentAvailability({
        model: { isPending: false, keyConfigured: false, lastTest: { ok: false, message: "401 api key ****be21 is invalid" } },
        runtime: { isPending: false, available: true },
      }),
    ).toBe("model_missing")
  })

  it("查询仍在加载时不抢答", () => {
    expect(agentAvailability({ model: { isPending: true, lastTest: { ok: false, message: "401" } }, runtime: { isPending: false } })).toBe("checking")
  })
})

describe("maskedCredentialTail", () => {
  it("只取上游已经掩码的尾号", () => {
    expect(maskedCredentialTail("401 api key ****be21 is invalid")).toBe("****be21")
  })

  it("没有掩码形态时返回 null：未掩码明文绝不透出", () => {
    expect(maskedCredentialTail("sk-abcdef123456")).toBeNull()
    expect(maskedCredentialTail("")).toBeNull()
    expect(maskedCredentialTail(undefined)).toBeNull()
  })
})

describe("AgentAvailabilityNotice · auth_failed", () => {
  it("给「去更新 Key」，并归一成去设置页的效果", () => {
    const onAction = vi.fn()
    render(<AgentAvailabilityNotice state="auth_failed" onAction={onAction} credentialHint="401 api key ****be21 is invalid" />)

    expect(screen.getByText("凭据失效")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去更新 Key" })).toBeInTheDocument()
    // 掩码尾号可见；只有掩码本身，没有完整 key。
    expect(screen.getByText(/\*\*\*\*be21/)).toBeInTheDocument()

    screen.getByRole("button", { name: "去更新 Key" }).click()
    expect(onAction).toHaveBeenCalledWith("configure_model")
    expect(agentAvailabilityActionEffect("configure_model")).toBe("settings")
  })

  it("传入未掩码明文时不渲染，避免把完整 key 显示到界面", () => {
    render(<AgentAvailabilityNotice state="auth_failed" credentialHint="sk-abcdef123456" />)

    expect(screen.queryByText(/sk-abcdef/)).not.toBeInTheDocument()
  })

  it("非凭据态不渲染掩码尾号", () => {
    render(<AgentAvailabilityNotice state="model_missing" credentialHint="****be21" />)

    expect(screen.queryByText(/\*\*\*\*be21/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
  })
})
