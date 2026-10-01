import { describe, expect, it } from "vitest"

import { agentAvailabilityFromModelConfig } from "@/components/agent-onboarding"

describe("agentAvailabilityFromModelConfig", () => {
  it("模型未配置时是 model_missing，与运行体是否就绪无关", () => {
    expect(agentAvailabilityFromModelConfig({ keyConfigured: false })).toBe("model_missing")
    expect(agentAvailabilityFromModelConfig({ keyConfigured: false }, { available: true })).toBe("model_missing")
  })

  it("模型已配置但后端无法启动运行体时是 runtime_offline", () => {
    expect(agentAvailabilityFromModelConfig({ keyConfigured: true })).toBe("runtime_offline")
    expect(agentAvailabilityFromModelConfig({ keyConfigured: true }, { available: false })).toBe("runtime_offline")
  })

  it("模型已配置且后端可在需要时启动运行体时是 available", () => {
    expect(agentAvailabilityFromModelConfig({ keyConfigured: true }, { available: true })).toBe("available")
  })
})
