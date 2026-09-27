import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { getProfile, getResume } from "@/lib/api"
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
})
