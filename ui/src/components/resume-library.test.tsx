import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import { ResumeLibrary } from "@/components/resume-library"
import { JDS, RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

const CLONE_ID = "res_cloned_from_list"

function clone(): Resume {
  return { ...RESUMES[0], id: CLONE_ID, title: "高级前端工程师简历（副本）" }
}

const notFound = () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "简历不存在" }, { status: 404 })

/** App 级集成：走真实路由，数据由 MSW 提供。 */
function renderLibrary() {
  return renderAppAt("/resumes")
}

function renderAppAt(path: string) {
  window.history.pushState({}, "", path)
  return render(<App />)
}

/** 组件级：直接挂载 ResumeLibrary，便于注入边界数据与断言失效查询。 */
function renderLibraryDirect(options: { path?: string; resumes?: Resume[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, "invalidateQueries")
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.path ?? "/resumes"]}>
        <ResumeLibrary resumes={options.resumes ?? RESUMES} templates={[]} jds={JDS} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

/** 「归档」既是页签也是卡片操作：页签是唯一带 aria-pressed 的按钮。 */
function tabButton(name: string): HTMLElement {
  const button = screen.getAllByRole("button", { name }).find((candidate) => candidate.hasAttribute("aria-pressed"))
  if (!button) throw new Error("找不到页签：" + name)
  return button
}

/** 可变数据源：归档 / 恢复真的改变生命周期，用来验证卡片在两个 Tab 间的移动。 */
function lifecycleHandlers() {
  let items: Resume[] = RESUMES.map((resume) => ({ ...resume }))
  const calls = { archive: [] as string[], restore: [] as string[] }
  const handlers = [
    http.get("/api/resumes", ({ request }) => {
      const lifecycle = new URL(request.url).searchParams.get("lifecycle")
      return HttpResponse.json(lifecycle ? items.filter((resume) => resume.lifecycle === lifecycle) : items)
    }),
    http.post("/api/resumes/:id/archive", ({ params }) => {
      calls.archive.push(params.id as string)
      items = items.map((resume) => (resume.id === params.id ? { ...resume, lifecycle: "archived" } : resume))
      return HttpResponse.json(items.find((resume) => resume.id === params.id))
    }),
    http.post("/api/resumes/:id/restore", ({ params }) => {
      calls.restore.push(params.id as string)
      items = items.map((resume) => (resume.id === params.id ? { ...resume, lifecycle: "active" } : resume))
      return HttpResponse.json(items.find((resume) => resume.id === params.id))
    }),
  ]
  return { handlers, calls }
}

describe("简历库列表：复制入口", () => {
  it("复制按钮调用 POST /resumes/{id}/duplicate 并进入副本", async () => {
    let duplicatePath: string | null = null
    server.use(
      http.post("/api/resumes/:id/duplicate", ({ params }) => {
        duplicatePath = params.id as string
        return HttpResponse.json(clone(), { status: 201 })
      }),
      http.get("/api/resumes/:id", ({ params }) => (params.id === CLONE_ID ? HttpResponse.json(clone()) : notFound())),
    )

    renderLibrary()
    const copyButtons = await screen.findAllByRole("button", { name: "复制" })
    fireEvent.click(copyButtons[0])

    await waitFor(() => expect(duplicatePath).toBe("res_fe_lead"))
    await waitFor(() => expect(window.location.pathname).toBe(`/resumes/${CLONE_ID}`))
    expect(await screen.findByRole("heading", { name: "高级前端工程师简历（副本）" })).toBeInTheDocument()
  })

  it("复制失败时就地展示 i18n 文案，不透出后端 message，也不跳转", async () => {
    server.use(
      http.post("/api/resumes/:id/duplicate", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderLibrary()
    const copyButtons = await screen.findAllByRole("button", { name: "复制" })
    fireEvent.click(copyButtons[0])

    expect(await screen.findByRole("alert")).toHaveTextContent("选中的原简历已不存在，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    expect(window.location.pathname).toBe("/resumes")
  })
})

describe("简历库：网格卡片布局", () => {
  it("列表是 sm:2 / xl:3 网格，卡片纵向排布且操作区用 mt-auto 贴底", async () => {
    renderLibrary()

    const card = (await screen.findByRole("link", { name: "高级前端工程师简历" })).closest("li")
    expect(card).not.toBeNull()
    expect(card).toHaveClass("flex-col")

    const list = card!.parentElement
    expect(list?.tagName).toBe("UL")
    expect(list).toHaveClass("lg:grid-cols-2")
    expect(list).toHaveClass("xl:grid-cols-3")

    // jsdom 不算布局，这里用 mt-auto 契约守住「操作区贴底、同排卡片按钮对齐」。
    expect(card!.querySelector(".mt-auto")).not.toBeNull()
  })

  it("归档卡片保留归档徽标且操作文案是恢复", async () => {
    renderLibrary()
    await screen.findByRole("link", { name: "高级前端工程师简历" })
    fireEvent.click(tabButton("归档"))

    const card = (await screen.findByRole("link", { name: "实习生简历（旧）" })).closest("li")
    expect(card).not.toBeNull()
    expect(card!).toHaveTextContent("已归档")
    expect(card!).toHaveTextContent("恢复")
  })

  it("归档徽标不折行（whitespace-nowrap）", async () => {
    renderLibraryDirect({ path: "/resumes?tab=archived" })

    const card = (await screen.findByRole("link", { name: "实习生简历（旧）" })).closest("li")
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText("已归档")).toHaveClass("whitespace-nowrap")
  })

  it("targetRole 为空或仅空白时不渲染「岗位方向：」整行", async () => {
    const blank: Resume = { ...RESUMES[0], id: "res_no_target_role", title: "未命名简历", targetRole: "", tags: [] }
    const whitespace: Resume = { ...RESUMES[0], id: "res_blank_target_role", title: "空白岗位简历", targetRole: "   ", tags: [] }
    renderLibraryDirect({ resumes: [blank, whitespace, RESUMES[1]] })

    const blankCard = screen.getByRole("link", { name: "未命名简历" }).closest("li") as HTMLElement
    expect(blankCard).not.toHaveTextContent("岗位方向")
    const whitespaceCard = screen.getByRole("link", { name: "空白岗位简历" }).closest("li") as HTMLElement
    expect(whitespaceCard).not.toHaveTextContent("岗位方向")

    // 有岗位方向的卡片不受影响。
    const normalCard = screen.getByRole("link", { name: "产品经理转型简历" }).closest("li") as HTMLElement
    expect(normalCard).toHaveTextContent("岗位方向：B 端产品经理")
  })
})

describe("简历库：归档 / 恢复接线", () => {
  it("点击归档调用 POST /resumes/{id}/archive，卡片移出活跃 Tab 并出现在归档 Tab", async () => {
    const { handlers, calls } = lifecycleHandlers()
    server.use(...handlers)

    renderLibrary()
    const card = (await screen.findByRole("link", { name: "产品经理转型简历" })).closest("li") as HTMLElement
    fireEvent.click(within(card).getByRole("button", { name: "归档" }))

    await waitFor(() => expect(calls.archive).toEqual(["res_pm_pivot"]))
    await waitFor(() => expect(screen.queryByRole("link", { name: "产品经理转型简历" })).not.toBeInTheDocument())

    fireEvent.click(tabButton("归档"))
    const archivedCard = (await screen.findByRole("link", { name: "产品经理转型简历" })).closest("li") as HTMLElement
    expect(archivedCard).toHaveTextContent("已归档")
    expect(within(archivedCard).getByRole("button", { name: "恢复" })).toBeInTheDocument()
  })

  it("归档 Tab 点恢复调用 POST /resumes/{id}/restore，卡片回到活跃 Tab", async () => {
    const { handlers, calls } = lifecycleHandlers()
    server.use(...handlers)

    renderAppAt("/resumes?tab=archived")
    const card = (await screen.findByRole("link", { name: "实习生简历（旧）" })).closest("li") as HTMLElement
    fireEvent.click(within(card).getByRole("button", { name: "恢复" }))

    await waitFor(() => expect(calls.restore).toEqual(["res_archived_intern"]))
    await waitFor(() => expect(screen.queryByRole("link", { name: "实习生简历（旧）" })).not.toBeInTheDocument())

    fireEvent.click(tabButton("活跃"))
    expect(await screen.findByRole("link", { name: "实习生简历（旧）" })).toBeInTheDocument()
  })

  it("归档成功后失效 resumes 与 workbench-summary 查询", async () => {
    server.use(http.post("/api/resumes/:id/archive", () => HttpResponse.json({ ...RESUMES[0], lifecycle: "archived" })))

    const { invalidate } = renderLibraryDirect()
    const card = (await screen.findByRole("link", { name: "高级前端工程师简历" })).closest("li") as HTMLElement
    fireEvent.click(within(card).getByRole("button", { name: "归档" }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["resumes"] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workbench-summary"] })
  })

  it("归档请求进行中按钮 disabled 且 aria-busy，结束后恢复可用", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post("/api/resumes/:id/archive", async () => {
        await gate
        return HttpResponse.json({ ...RESUMES[0], lifecycle: "archived" })
      }),
    )

    renderLibrary()
    const card = (await screen.findByRole("link", { name: "高级前端工程师简历" })).closest("li") as HTMLElement
    const button = within(card).getByRole("button", { name: "归档" })
    fireEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveAttribute("aria-busy", "true")

    release()
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it("归档失败时用归档专用文案显示 role=alert，不透出后端 message", async () => {
    server.use(
      http.post("/api/resumes/:id/archive", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderLibrary()
    const card = (await screen.findByRole("link", { name: "高级前端工程师简历" })).closest("li") as HTMLElement
    fireEvent.click(within(card).getByRole("button", { name: "归档" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("这份简历已不存在，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    // 失败不静默：卡片留在原 Tab，不假装已归档。
    expect(screen.getByRole("link", { name: "高级前端工程师简历" })).toBeInTheDocument()
  })
})

describe("简历库：筛选状态入 URL", () => {
  it("Tab / 搜索词 / 标签写入查询参数", async () => {
    renderLibrary()
    await screen.findByRole("link", { name: "高级前端工程师简历" })

    fireEvent.click(tabButton("归档"))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("tab")).toBe("archived"))

    fireEvent.change(screen.getByLabelText("按标题或岗位搜索…"), { target: { value: "实习" } })
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("q")).toBe("实习"))

    fireEvent.click(screen.getByRole("button", { name: "实习" }))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("tag")).toBe("实习"))
  })

  it("深链 ?tab=archived&q=&tag= 打开即保持，重新挂载（刷新）后不丢", async () => {
    const path = `/resumes?tab=archived&q=${encodeURIComponent("实习")}&tag=${encodeURIComponent("实习")}`
    renderAppAt(path)

    expect(await screen.findByRole("link", { name: "实习生简历（旧）" })).toBeInTheDocument()
    expect(tabButton("归档")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("按标题或岗位搜索…")).toHaveValue("实习")
    expect(screen.getByRole("button", { name: "实习" })).toHaveAttribute("aria-pressed", "true")

    cleanup()
    renderAppAt(path)
    expect(await screen.findByRole("link", { name: "实习生简历（旧）" })).toBeInTheDocument()
    expect(tabButton("归档")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("按标题或岗位搜索…")).toHaveValue("实习")
  })

  it("点「新建简历」写入 create=1，关闭弹窗后从 URL 移除", async () => {
    renderAppAt("/resumes")
    fireEvent.click(await screen.findByRole("button", { name: "新建简历" }))
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("create")).toBe("1"))

    const dialog = await screen.findByRole("dialog", { name: "开始一份新的简历" })
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))

    await waitFor(() => expect(new URLSearchParams(window.location.search).get("create")).toBeNull())
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "开始一份新的简历" })).not.toBeInTheDocument())
  })
})

describe("简历库：搜索大小写不敏感", () => {
  it("搜索 qa 命中标题或岗位含 QA 的简历", async () => {
    const qaTitle: Resume = { ...RESUMES[0], id: "res_qa_title", title: "QA 工程师简历", targetRole: "", tags: [] }
    const qaRole: Resume = { ...RESUMES[1], id: "res_qa_role", title: "质量方向简历", targetRole: "QA Lead", tags: [] }
    server.use(
      http.get("/api/resumes", ({ request }) => {
        const lifecycle = new URL(request.url).searchParams.get("lifecycle")
        return HttpResponse.json(lifecycle === "archived" ? [] : [qaTitle, qaRole])
      }),
    )

    renderLibrary()
    fireEvent.change(await screen.findByLabelText("按标题或岗位搜索…"), { target: { value: "qa" } })

    expect(await screen.findByRole("link", { name: "QA 工程师简历" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "质量方向简历" })).toBeInTheDocument()
  })
})

describe("简历库：标签 chips 与空态", () => {
  it("归档 Tab 的 chips 只统计归档简历出现过的标签", async () => {
    renderLibraryDirect({ path: "/resumes?tab=archived" })

    expect(screen.getByRole("button", { name: "实习" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "前端" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "React" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "产品" })).not.toBeInTheDocument()
  })

  it("归档 Tab 空态用归档专用描述，与活跃空态不同", async () => {
    renderLibraryDirect({
      path: "/resumes?tab=archived",
      resumes: RESUMES.filter((resume) => resume.lifecycle === "active"),
    })

    expect(screen.getByText("暂无归档简历")).toBeInTheDocument()
    expect(screen.getByText("归档的简历会保留在这里，恢复后可继续编辑。")).toBeInTheDocument()
    expect(screen.queryByText("点击右上角新建一份简历开始。")).not.toBeInTheDocument()
  })

  it("活跃空态保持原有描述，且筛选空态仍有自己的文案", async () => {
    renderLibraryDirect({ resumes: [] })
    expect(screen.getByText("还没有简历")).toBeInTheDocument()
    expect(screen.getByText("点击右上角新建一份简历开始。")).toBeInTheDocument()
    expect(screen.queryByText("归档的简历会保留在这里，恢复后可继续编辑。")).not.toBeInTheDocument()

    cleanup()
    renderLibraryDirect({ path: "/resumes?q=zzz" })
    expect(screen.getByText("没有匹配的简历")).toBeInTheDocument()
    expect(screen.getByText("已保留当前筛选条件，可清除后查看全部。")).toBeInTheDocument()
  })
})
