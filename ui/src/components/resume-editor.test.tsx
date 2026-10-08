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
  function tree(next: Resume) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ResumeEditor resume={next} templateName="经典单栏" boundJds={[]} />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
  const { rerender } = render(tree(resume))
  return { queryClient, rerenderWith: (next: Resume) => rerender(tree(next)) }
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

describe("服务端工作副本变化后的同步", () => {
  it("没有本地未保存内容时，审批写入的新文档同步进编辑器", async () => {
    const { rerenderWith } = renderEditor({ ...DIRTY, saveState: "committed" })

    rerenderWith({
      ...DIRTY,
      saveState: "uncommitted",
      currentVersionId: "v_fe_9",
      document: { ...DIRTY.document, basics: { ...DIRTY.document.basics, fullName: "黄鹏星" } },
    })

    await waitFor(() => expect(screen.getByLabelText("姓名")).toHaveValue("黄鹏星"))
  })

  it("本地有未保存输入时不覆盖，保留用户已输入内容", async () => {
    const { rerenderWith } = renderEditor({ ...DIRTY, saveState: "committed" })
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "本地未保存" } })

    rerenderWith({
      ...DIRTY,
      currentVersionId: "v_fe_9",
      document: { ...DIRTY.document, basics: { ...DIRTY.document.basics, fullName: "服务端值" } },
    })

    await waitFor(() => expect(screen.getByLabelText("姓名")).toHaveValue("本地未保存"))
  })
})

describe("服务端已更新的提示条", () => {
  const SERVER_BUMP: Resume = {
    ...DIRTY,
    saveState: "uncommitted",
    currentVersionId: "v_fe_9",
    document: { ...DIRTY.document, basics: { ...DIRTY.document.basics, fullName: "服务端值" } },
  }

  it("本地有未保存输入时给出提示条，且不覆盖本地输入", async () => {
    const { rerenderWith } = renderEditor({ ...DIRTY, saveState: "committed" })
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "本地未保存" } })

    rerenderWith(SERVER_BUMP)

    expect(await screen.findByText("服务端已更新，本地有未保存输入。")).toBeInTheDocument()
    expect(screen.getByLabelText("姓名")).toHaveValue("本地未保存")
  })

  it("点「载入服务端版本」后采用服务端文档并收起提示条", async () => {
    const { rerenderWith } = renderEditor({ ...DIRTY, saveState: "committed" })
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "本地未保存" } })
    rerenderWith(SERVER_BUMP)

    fireEvent.click(await screen.findByRole("button", { name: "载入服务端版本" }))

    await waitFor(() => expect(screen.getByLabelText("姓名")).toHaveValue("服务端值"))
    expect(screen.queryByText("服务端已更新，本地有未保存输入。")).not.toBeInTheDocument()
  })
})
