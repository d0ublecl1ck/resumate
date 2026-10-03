import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { RESUMES, TEMPLATES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume, ResumeTemplate } from "@/lib/types"

afterEach(cleanup)

const CREATED_ID = "res_created_blank"
const CLONE_ID = "res_cloned_copy"
const ACTIVE_SOURCES = RESUMES.filter((resume) => resume.lifecycle === "active")
const FIRST_PUBLISHED_TEMPLATE = TEMPLATES.find((template) => template.status === "published")!

function resumeWith(id: string, title: string): Resume {
  return { ...RESUMES[0], id, title }
}

const notFound = () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "简历不存在" }, { status: 404 })

/** App 级集成：走真实路由，验证创建后落到编辑器而不是 404。 */
function renderAppAt(path: string) {
  window.history.pushState({}, "", path)
  return render(<App />)
}

/** 组件级：直接挂载 Modal，便于注入边界数据与断言失效查询。 */
function renderModal(props: { resumes?: Resume[]; templates?: ResumeTemplate[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/resumes"]}>
        <Routes>
          <Route
            path="/resumes"
            element={
              <CreateResumeModal
                open
                onClose={() => {}}
                resumes={props.resumes ?? RESUMES}
                templates={props.templates ?? TEMPLATES}
              />
            }
          />
          <Route path="/resumes/:id" element={<div data-testid="editor-route">编辑器</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

/** 第一步点创建后进入的选择层。 */
function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "创建" }))
  return screen.getByRole("dialog", { name: "选择要复制的简历" })
}

/** 在选择层里挑一份来源并确认复制。 */
function pickSource(name: RegExp) {
  openPicker()
  fireEvent.click(screen.getByRole("button", { name }))
  fireEvent.click(screen.getByRole("button", { name: "创建副本" }))
}

describe("创建简历 Modal：两条链路", () => {
  it("只提供「从现有简历复制」与「完全新开」，不再有标题 / 岗位 / 模板输入", () => {
    renderModal()

    expect(screen.getByRole("button", { name: /从现有简历复制/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /完全新开/ })).toBeInTheDocument()
    expect(screen.queryByLabelText("简历标题")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("目标岗位")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("模板")).not.toBeInTheDocument()
  })

  it("默认落在复制链路，且第一步不再出现来源下拉", () => {
    renderModal()

    expect(screen.getByRole("button", { name: /从现有简历复制/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByLabelText("复制来源")).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "选择要复制的简历" })).not.toBeInTheDocument()
  })

  it("点击创建不直接复制，而是先进入简历选择层，且只列活跃简历", async () => {
    let duplicated = false
    server.use(
      http.post("/api/resumes/:id/duplicate", () => {
        duplicated = true
        return HttpResponse.json(resumeWith(CLONE_ID, "副本"), { status: 201 })
      }),
    )

    renderModal()
    const picker = openPicker()

    expect(picker).toBeInTheDocument()
    expect(duplicated).toBe(false)
    for (const resume of ACTIVE_SOURCES) {
      expect(screen.getByRole("button", { name: new RegExp(resume.title) })).toBeInTheDocument()
    }
    expect(screen.queryByRole("button", { name: /实习生简历/ })).not.toBeInTheDocument()
  })

  it("在选择层选中来源后才会创建副本并跳转", async () => {
    let duplicatePath: string | null = null
    server.use(
      http.post("/api/resumes/:id/duplicate", ({ params }) => {
        duplicatePath = params.id as string
        return HttpResponse.json(resumeWith(CLONE_ID, "高级前端工程师简历（副本）"), { status: 201 })
      }),
    )

    renderModal()
    pickSource(/高级前端工程师简历/)

    await waitFor(() => expect(duplicatePath).toBe(ACTIVE_SOURCES[0].id))
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("选择层取消后回到第一步，不创建任何资源", () => {
    let duplicated = false
    server.use(
      http.post("/api/resumes/:id/duplicate", () => {
        duplicated = true
        return HttpResponse.json(resumeWith(CLONE_ID, "副本"), { status: 201 })
      }),
    )

    renderModal()
    openPicker()
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    expect(screen.queryByRole("dialog", { name: "选择要复制的简历" })).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: "开始一份新的简历" })).toBeInTheDocument()
    expect(duplicated).toBe(false)
  })

  it("完全新开用默认标题与首个已发布模板创建空文档并跳转", async () => {
    let payload: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes", async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(resumeWith(CREATED_ID, "未命名简历"), { status: 201 })
      }),
    )

    renderModal()
    fireEvent.click(screen.getByRole("button", { name: /完全新开/ }))
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    await waitFor(() => expect(payload).toMatchObject({ title: "未命名简历", templateId: FIRST_PUBLISHED_TEMPLATE.id }))
    expect(payload!.document).toBeUndefined()
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("创建成功后失效简历列表相关查询键", async () => {
    const { invalidate } = renderModal()
    server.use(
      http.post("/api/resumes/:id/duplicate", () => HttpResponse.json(resumeWith(CLONE_ID, "副本"), { status: 201 })),
    )

    pickSource(/高级前端工程师简历/)

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resumes"] }))
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("无活跃简历时复制链路不可选，落到完全新开并给出原因", () => {
    renderModal({ resumes: RESUMES.filter((resume) => resume.lifecycle !== "active") })

    expect(screen.getByRole("button", { name: /从现有简历复制/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /完全新开/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("还没有可复制的简历，先完全新开一份。")).toBeInTheDocument()
  })

  it("无已发布模板时完全新开不可提交，复制链路仍可用", async () => {
    let duplicatePath: string | null = null
    server.use(
      http.post("/api/resumes/:id/duplicate", ({ params }) => {
        duplicatePath = params.id as string
        return HttpResponse.json(resumeWith(CLONE_ID, "副本"), { status: 201 })
      }),
    )

    renderModal({ templates: TEMPLATES.filter((template) => template.status !== "published") })

    expect(screen.getByRole("button", { name: /完全新开/ })).toBeDisabled()
    expect(screen.getByText(/没有已发布的模板/)).toBeInTheDocument()

    pickSource(/高级前端工程师简历/)
    await waitFor(() => expect(duplicatePath).toBe(ACTIVE_SOURCES[0].id))
  })

  it("选择层提交中禁用确认按钮并显示加载态", async () => {
    let release: (() => void) | undefined
    server.use(
      http.post("/api/resumes/:id/duplicate", async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return HttpResponse.json(resumeWith(CLONE_ID, "副本"), { status: 201 })
      }),
    )

    renderModal()
    openPicker()
    fireEvent.click(screen.getByRole("button", { name: /高级前端工程师简历/ }))
    const confirm = screen.getByRole("button", { name: "创建副本" })
    fireEvent.click(confirm)

    await waitFor(() => expect(confirm).toBeDisabled())
    expect(confirm).toHaveTextContent("创建中…")

    release?.()
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("原简历已不存在时在选择层就地展示 i18n 文案，不透出后端 message，也不跳转", async () => {
    server.use(
      http.post("/api/resumes/:id/duplicate", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderModal()
    pickSource(/高级前端工程师简历/)

    expect(await screen.findByRole("alert")).toHaveTextContent("选中的原简历已不存在，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("editor-route")).not.toBeInTheDocument()
    // 失败后留在选择层，可换一份重试。
    expect(screen.getByRole("dialog", { name: "选择要复制的简历" })).toBeInTheDocument()
  })

  it("完全新开失败时就地展示 i18n 文案，不透出后端 message", async () => {
    server.use(
      http.post("/api/resumes", () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "raw-backend-message-should-not-leak" }, { status: 422 }),
      ),
    )

    renderModal()
    fireEvent.click(screen.getByRole("button", { name: /完全新开/ }))
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("创建参数不合法，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
  })

  it("App 级：完全新开创建成功后进入编辑器而不是 404", async () => {
    let payload: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes", async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(resumeWith(CREATED_ID, "未命名简历"), { status: 201 })
      }),
      http.get("/api/resumes/:id", ({ params }) =>
        params.id === CREATED_ID ? HttpResponse.json(resumeWith(CREATED_ID, "未命名简历")) : notFound(),
      ),
    )

    renderAppAt("/resumes?create=1")
    fireEvent.click(await screen.findByRole("button", { name: /完全新开/ }))
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    await waitFor(() => expect(payload).toMatchObject({ title: "未命名简历" }))
    await waitFor(() => expect(window.location.pathname).toBe(`/resumes/${CREATED_ID}`))
    expect(await screen.findByRole("heading", { name: "未命名简历" })).toBeInTheDocument()
    expect(screen.queryByText("未找到该简历")).not.toBeInTheDocument()
  })
})
