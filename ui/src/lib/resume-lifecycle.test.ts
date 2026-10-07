import { describe, expect, it } from "vitest"
import { ApiRequestError } from "@/lib/api-client"
import { resumeLifecycleErrorMessage } from "@/lib/resume-lifecycle"

// 归档 / 恢复按钮的错误出口：文案必须指向当前动作，不能复用创建流程的措辞。
describe("归档 / 恢复的错误文案映射", () => {
  it("归档遇到服务端故障时给出归档专用文案，而不是创建流程的措辞", () => {
    const message = resumeLifecycleErrorMessage(new ApiRequestError("SERVER_ERROR", "raw-backend-message-should-not-leak", 500), "archive")

    expect(message).toBe("归档失败，请稍后重试。")
    expect(message).not.toContain("创建")
    expect(message).not.toContain("raw-backend-message-should-not-leak")
  })

  it("恢复遇到服务端故障时给出恢复专用文案", () => {
    const message = resumeLifecycleErrorMessage(new ApiRequestError("SERVER_ERROR", "raw-backend-message-should-not-leak", 500), "restore")

    expect(message).toBe("恢复失败，请稍后重试。")
    expect(message).not.toContain("创建")
    expect(message).not.toContain("raw-backend-message-should-not-leak")
  })

  it("资源不存在时提示刷新，两种动作一致", () => {
    expect(resumeLifecycleErrorMessage(new ApiRequestError("RESOURCE_NOT_FOUND", "x", 404), "archive")).toBe("这份简历已不存在，请刷新后重试。")
    expect(resumeLifecycleErrorMessage(new ApiRequestError("RESOURCE_NOT_FOUND", "x", 404), "restore")).toBe("这份简历已不存在，请刷新后重试。")
  })

  it("权限不足与网络失败各有专门说明", () => {
    expect(resumeLifecycleErrorMessage(new ApiRequestError("FORBIDDEN", "x", 403), "archive")).toBe("当前账号没有修改这份简历的权限。")
    expect(resumeLifecycleErrorMessage(new ApiRequestError("UNAUTHENTICATED", "x", 401), "restore")).toBe("当前账号没有修改这份简历的权限。")
    expect(resumeLifecycleErrorMessage(new ApiRequestError("NETWORK_ERROR", "x", 0), "archive")).toBe("无法连接后端服务，请检查网络后重试。")
  })

  it("未知异常落到对应动作的兜底文案", () => {
    expect(resumeLifecycleErrorMessage(new Error("boom"), "archive")).toBe("归档失败，请稍后重试。")
    expect(resumeLifecycleErrorMessage(new Error("boom"), "restore")).toBe("恢复失败，请稍后重试。")
  })
})
