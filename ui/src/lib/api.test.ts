import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { getModelCatalog, getModelConfig, getPreferences, getProfile, getResume, parseJdFromText, register, resendVerification, updatePreferences, verifyEmail } from "@/lib/api"
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

    expect(catalog.source).toBe("models.dev")
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

  it("register 返回 202 中性响应且不含用户资料", async () => {
    const accepted = await register({ email: "new@resumate.dev", password: "password123", displayName: "张沐" })

    expect(accepted).toEqual({ status: "verification_sent", email: "new@resumate.dev" })
    expect("permissions" in accepted).toBe(false)
  })

  it("resendVerification 支持 email 与 token 两种入参", async () => {
    const byEmail = await resendVerification({ email: "new@resumate.dev" })
    expect(byEmail.status).toBe("verification_sent")
    expect(byEmail.email).toBe("new@resumate.dev")

    const byToken = await resendVerification({ token: "valid-token" })
    expect(byToken.email).toBe("test@resumate.dev")
  })

  it("resendVerification 已激活邮箱返回 already_verified", async () => {
    server.use(
      http.post("/api/auth/verification/resend", () => HttpResponse.json({ status: "already_verified", email: "test@resumate.dev" }, { status: 202 })),
    )

    const accepted = await resendVerification({ token: "valid-token" })
    expect(accepted.status).toBe("already_verified")
  })

  it("verifyEmail 消费令牌并返回会话用户", async () => {
    const user = await verifyEmail("valid-token")
    expect(user.email).toBe("test@resumate.dev")
  })

  it("verifyEmail 无效令牌映射为 VERIFICATION_TOKEN_INVALID", async () => {
    await expect(verifyEmail("expired-token")).rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID", status: 400 })
  })

  it("parseJdFromText 走真实 POST /jds:parse-text 契约", async () => {
    const seen: { url: string; method: string; body: unknown }[] = []
    server.use(
      http.post(/\/api\/jds:parse-text$/, async ({ request }) => {
        seen.push({ url: request.url, method: request.method, body: await request.json() })
        return HttpResponse.json({
          role: "高级前端工程师", // i18n-allow: MSW 演示数据
          company: "美团", // i18n-allow: MSW 演示数据
          tags: ["前端"], // i18n-allow: MSW 演示数据
          body: "岗位正文", // i18n-allow: MSW 演示数据
          sourceUrl: null,
          extracted: [],
          parseConfidence: 0.91,
          note: "由 AI 整理，请核对后创建。", // i18n-allow: 后端返回原文
          inputSource: "text",
        })
      }),
    )

    const draft = await parseJdFromText("一段岗位文本") // i18n-allow: MSW 演示数据

    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe("POST")
    expect(seen[0].body).toEqual({ text: "一段岗位文本" }) // i18n-allow: MSW 演示数据
    expect(draft.role).toBe("高级前端工程师") // i18n-allow: MSW 演示数据
    expect(draft.parseConfidence).toBe(0.91)
  })

  it("parseJdFromText 透传 MODEL_NOT_CONFIGURED 机器码", async () => {
    server.use(
      http.post(/\/api\/jds:parse-text$/, () =>
        HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "未配置" }, { status: 409 }),
      ),
    )

    await expect(parseJdFromText("x")).rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED", status: 409 })
  })
})
