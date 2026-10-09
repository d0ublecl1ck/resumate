import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ResumeEditor } from "@/components/resume-editor"
import { RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

const DIRTY = RESUMES[0]

function renderEditor(resume: Resume = DIRTY) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResumeEditor resume={resume} templateName="经典单栏" boundJds={[]} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { queryClient }
}

describe("简历编辑器：手动保存", () => {
  it("点保存发出 PUT /resumes/{id}/document，带基线版本并展示服务端保存状态", async () => {
    let path: string | null = null
    let body: Record<string, unknown> | null = null
    server.use(
      http.put("/api/resumes/:id/document", async ({ request, params }) => {
        path = params.id as string
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...DIRTY, saveState: "committed", currentVersionId: "v_fe_6" })
      }),
    )

    renderEditor()
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "张沐沐" } })
    fireEvent.click(screen.getByRole("button", { name: "保存（flush）" }))

    await waitFor(() => expect(path).toBe(DIRTY.id))
    expect(body!.baseVersionId).toBe(DIRTY.currentVersionId)
    expect((body!.document as { basics: { fullName: string } }).basics.fullName).toBe("张沐沐")
    expect(body!.message).toBe("手动编辑")
    expect(await screen.findByText("已保存版本")).toBeInTheDocument()
  })

  it("保存成功后失效简历查询，让基线重新取服务端值", async () => {
    const { queryClient } = renderEditor()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    server.use(
      http.put("/api/resumes/:id/document", () => HttpResponse.json({ ...DIRTY, saveState: "committed", currentVersionId: "v_fe_6" })),
    )

    fireEvent.click(screen.getByRole("button", { name: "保存（flush）" }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resume", DIRTY.id] }))
  })

  it("没有改动时保存按钮不可用，也不发请求", async () => {
    let called = false
    server.use(
      http.put("/api/resumes/:id/document", () => {
        called = true
        return HttpResponse.json(RESUMES[0])
      }),
    )

    renderEditor({ ...DIRTY, saveState: "committed" })
    const button = screen.getByRole("button", { name: "保存（flush）" })
    expect(button).toBeDisabled()
    fireEvent.click(button)

    expect(called).toBe(false)
  })

  it("基线过期时就地展示 i18n 冲突文案，不透出后端 message，也不显示已保存", async () => {
    server.use(
      http.put("/api/resumes/:id/document", () =>
        HttpResponse.json(
          { code: "BASE_VERSION_STALE", message: "raw-backend-message-should-not-leak", latestVersionId: "v_fe_9" },
          { status: 409 },
        ),
      ),
    )

    renderEditor()
    fireEvent.click(screen.getByRole("button", { name: "保存（flush）" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("简历内容已在别处更新，请刷新后基于最新版本重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    expect(screen.queryByText("已保存版本")).not.toBeInTheDocument()
  })

  it("网络失败时给可理解文案并保持可重试", async () => {
    server.use(
      http.put("/api/resumes/:id/document", () => HttpResponse.json({ code: "NETWORK_ERROR", message: "offline" }, { status: 503 })),
    )

    renderEditor()
    const button = screen.getByRole("button", { name: "保存（flush）" })
    fireEvent.click(button)

    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接后端服务，请检查网络后重试。")
    await waitFor(() => expect(button).toBeEnabled())
  })
})

describe("简历编辑器：导出", () => {
  it("点导出请求 GET /resumes/{id}/export?format=markdown 并触发下载", async () => {
    let requestUrl = ""
    server.use(
      http.get("/api/resumes/:id/export", ({ request }) => {
        const url = new URL(request.url)
        requestUrl = url.pathname + url.search
        return new HttpResponse("# 张沐", {
          headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=resume.md" },
        })
      }),
    )
    const createObjectURL = vi.fn(() => "blob:mock")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true, writable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    renderEditor()
    fireEvent.click(screen.getByRole("button", { name: "导出" }))

    expect(await screen.findByText("Markdown 文件已导出。")).toBeInTheDocument()
    expect(requestUrl).toBe(`/api/resumes/${DIRTY.id}/export?format=markdown`)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock")
  })

  it("导出失败时展示 i18n 文案，不透出服务端 message", async () => {
    server.use(
      http.get("/api/resumes/:id/export", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-export-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderEditor()
    fireEvent.click(screen.getByRole("button", { name: "导出" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("这份简历已不存在，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-export-message-should-not-leak/)).not.toBeInTheDocument()
  })
})
