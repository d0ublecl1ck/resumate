import { describe, expect, it } from "vitest"

import { agentAvailability } from "@/components/agent-onboarding"

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
