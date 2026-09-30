import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { JDS, RESUMES, TEMPLATES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

const CREATED_ID = "res_created_form"

function createdResume(title: string): Resume {
  return { ...RESUMES[0], id: CREATED_ID, title, targetRole: "前端工程师" }
}

/** App 级集成：走真实路由，验证创建后不再落到 404。 */
function renderAppAt(path: string) {
  window.history.pushState({}, "", path)
  return render(<App />)
}

/** 组件级：直接挂载 Modal，便于断言失效查询与提交态。 */
function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/resumes"]}>
        <Routes>
          <Route path="/resumes" element={<CreateResumeModal open onClose={() => {}} templates={TEMPLATES} jds={JDS} />} />
          <Route path="/resumes/:id" element={<div data-testid="editor-route">编辑器</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("简历标题"), { target: { value: "新简历" } })
  fireEvent.change(screen.getByLabelText("目标岗位"), { target: { value: "前端工程师" } })
}

describe("创建简历 Modal", () => {
  it("表单创建发出 POST /resumes 并跳转到后端返回的 id（不再 404）", async () => {
    let payload: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes", async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createdResume("新简历"), { status: 201 })
      }),
      http.get("/api/resumes/:id", ({ params }) =>
        params.id === CREATED_ID
          ? HttpResponse.json(createdResume("新简历"))
          : HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "简历不存在" }, { status: 404 }),
      ),
    )

    renderAppAt("/resumes?create=1")
    fireEvent.change(await screen.findByLabelText("简历标题"), { target: { value: "新简历" } })
    fireEvent.change(screen.getByLabelText("目标岗位"), { target: { value: "前端工程师" } })
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    await waitFor(() => expect(payload).toMatchObject({ title: "新简历", targetRole: "前端工程师" }))
    await waitFor(() => expect(window.location.pathname).toBe(`/resumes/${CREATED_ID}`))
    expect(await screen.findByRole("heading", { name: "新简历" })).toBeInTheDocument()
    expect(screen.queryByText("未找到该简历")).not.toBeInTheDocument()
  })

  it("创建成功后失效简历列表相关查询键", async () => {
    const { invalidate } = renderModal()
    server.use(http.post("/api/resumes", () => HttpResponse.json(createdResume("新简历"), { status: 201 })))

    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resumes"] }))
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("提交中禁用创建按钮并显示加载态", async () => {
    let release: (() => void) | undefined
    server.use(
      http.post("/api/resumes", async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return HttpResponse.json(createdResume("新简历"), { status: 201 })
      }),
    )

    renderModal()
    fillForm()
    const button = screen.getByRole("button", { name: "创建" })
    fireEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveTextContent("创建中…")

    release?.()
    await waitFor(() => expect(screen.getByTestId("editor-route")).toBeInTheDocument())
  })

  it("创建失败就地展示 i18n 文案，不透出后端 message，也不跳转", async () => {
    server.use(
      http.post("/api/resumes", () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "raw-backend-message-should-not-leak" }, { status: 422 }),
      ),
    )

    renderModal()
    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "创建" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("标题或模板不合法，请检查后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("editor-route")).not.toBeInTheDocument()
  })

  it.each([
    ["对话创建", /对话创建/],
    ["Profile 生成", /Profile 生成/],
  ])("%s 明确提示 Agent 创建未接入且不跳转", async (_label, methodName) => {
    let posted = false
    server.use(
      http.post("/api/resumes", () => {
        posted = true
        return HttpResponse.json(createdResume("新简历"), { status: 201 })
      }),
    )

    renderModal()
    fireEvent.click(screen.getByRole("button", { name: methodName }))
    fillForm()
    fireEvent.click(screen.getByRole("button", { name: "预览创建摘要" }))

    expect(await screen.findByRole("status")).toHaveTextContent("尚未接入后端 Agent 服务")
    expect(posted).toBe(false)
    expect(screen.queryByTestId("editor-route")).not.toBeInTheDocument()
  })
})
