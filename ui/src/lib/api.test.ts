import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { getModelCatalog, getModelConfig, getPreferences, getProfile, getResume, updatePreferences } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { server } from "@/test-server"

describe("API 对接", () => {
  it("getProfile 读取后端返回的 Profile", async () => {
    const profile = await getProfile()

    expect(profile.ownerId).toBe("user_zhang")
    expect(Array.isArray(profile.facts)).toBe(true)
  })

  it("后端 404 映射为携带机器错误码的 ApiRequestError", async () => {
    server.use(http.get("/api/resumes/:id", () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "简历不存在" }, { status: 404 })))

    await expect(getResume("res_missing")).rejects.toMatchObject({
      name: "ApiRequestError",
      code: "RESOURCE_NOT_FOUND",
      status: 404,
      message: "简历不存在",
    })
    await expect(getResume("res_missing")).rejects.toBeInstanceOf(ApiRequestError)
  })

  it("网络失败映射为 NETWORK_ERROR", async () => {
    server.use(http.get("/api/profile", () => HttpResponse.error()))

    await expect(getProfile()).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 })
  })

  it("设置端点走真实 HTTP 契约", async () => {
    const prefs = await getPreferences()

    expect(prefs.theme).toBe("paper")
    expect(prefs.shortcuts.length).toBeGreaterThan(0)

    const updated = await updatePreferences({ autosave: false, displayName: "张沐" })

    expect(updated.autosave).toBe(false)
    expect(updated.displayName).toBe("张沐")
  })

  it("模型配置不回显明文密钥", async () => {
    const config = await getModelConfig()

    expect(config.keyConfigured).toBe(true)
    expect("apiKey" in config).toBe(false)
  })

  it("模型目录返回 provider 与 model 列表", async () => {
    const catalog = await getModelCatalog()

    expect(catalog.source).toBe("litellm")
    const openai = catalog.providers.find((provider) => provider.id === "openai")
    expect(openai?.models.some((model) => model.id === "gpt-4o-mini")).toBe(true)
  })

  it("模型目录支持 provider 与 q 过滤", async () => {
    const filtered = await getModelCatalog({ provider: "anthropic" })
    expect(filtered.providers.map((provider) => provider.id)).toEqual(["anthropic"])

    const searched = await getModelCatalog({ q: "opus" })
    const models = searched.providers.flatMap((provider) => provider.models)
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((model) => model.id.includes("opus") || model.label.toLowerCase().includes("opus"))).toBe(true)
  })
})
