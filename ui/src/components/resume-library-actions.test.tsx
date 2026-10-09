import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import App from "@/App"
import { RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

// App 级挂载：RequireAuth 先解析用户，再并发拉取 active / archived / templates / jds。
const APP_MOUNT_TIMEOUT_MS = 10_000
const APP_MOUNT_TEST_TIMEOUT_MS = 30_000

/** 可变数据源：PATCH / DELETE 真的改变列表，重取数后卡片随之更新或消失。 */
function storeHandlers() {
  let items: Resume[] = RESUMES.map((resume) => ({ ...resume }))
  const calls: { patches: { id: string; body: Record<string, unknown> }[]; deletes: string[] } = {
    patches: [],
    deletes: [],
  }
  const handlers = [
    http.get("/api/resumes", ({ request }) => {
      const lifecycle = new URL(request.url).searchParams.get("lifecycle")
      return HttpResponse.json(lifecycle ? items.filter((resume) => resume.lifecycle === lifecycle) : items)
    }),
    http.patch("/api/resumes/:id", async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>
      calls.patches.push({ id: params.id as string, body })
      items = items.map((resume) => (resume.id === params.id ? { ...resume, ...(body as Partial<Resume>) } : resume))
      return HttpResponse.json(items.find((resume) => resume.id === params.id))
    }),
    http.delete("/api/resumes/:id", ({ params }) => {
      calls.deletes.push(params.id as string)
      items = items.filter((resume) => resume.id !== params.id)
      return HttpResponse.json({ ...RESUMES[0], id: params.id as string, lifecycle: "deleted" })
    }),
  ]
  return { handlers, calls }
}

function renderLibrary() {
  window.history.pushState({}, "", "/resumes")
  return render(<App />)
}

/** 按卡片标题定位 <li>，所有卡片级断言都限定在该卡片内。 */
async function cardFor(title: string): Promise<HTMLElement> {
  const link = await screen.findByRole("link", { name: title }, { timeout: APP_MOUNT_TIMEOUT_MS })
  return link.closest("li") as HTMLElement
}

describe("简历库卡片：重命名入口", () => {
  it("点「重命名」打开小弹窗，输入后 PATCH 标题并更新卡片", async () => {
    const { handlers, calls } = storeHandlers()
    server.use(...handlers)

    renderLibrary()
    const card = await cardFor("高级前端工程师简历")
    fireEvent.click(within(card).getByRole("button", { name: "重命名" }))

    const dialog = await screen.findByRole("dialog", { name: "重命名简历" })
    const input = within(dialog).getByLabelText("简历名称")
    expect(input).toHaveValue("高级前端工程师简历")

    fireEvent.change(input, { target: { value: "2026 主打简历" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "保存名称" }))

    await waitFor(() => expect(calls.patches).toEqual([{ id: "res_fe_lead", body: { title: "2026 主打简历" } }]))
    expect(await screen.findByRole("link", { name: "2026 主打简历" }, { timeout: APP_MOUNT_TIMEOUT_MS })).toBeInTheDocument()
  }, APP_MOUNT_TEST_TIMEOUT_MS)

  it("重命名弹窗可以取消，不发出 PATCH", async () => {
    const { handlers, calls } = storeHandlers()
    server.use(...handlers)

    renderLibrary()
    const card = await cardFor("产品经理转型简历")
    fireEvent.click(within(card).getByRole("button", { name: "重命名" }))

    const dialog = await screen.findByRole("dialog", { name: "重命名简历" })
    fireEvent.change(within(dialog).getByLabelText("简历名称"), { target: { value: "不该保存" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "重命名简历" })).not.toBeInTheDocument())
    expect(calls.patches).toEqual([])
  }, APP_MOUNT_TEST_TIMEOUT_MS)
})

describe("简历库卡片：标签编辑入口", () => {
  it("可添加新标签、删除旧标签，并 PATCH tags", async () => {
    const { handlers, calls } = storeHandlers()
    server.use(...handlers)

    renderLibrary()
    const card = await cardFor("产品经理转型简历")
    const originalTags = RESUMES.find((resume) => resume.id === "res_pm_pivot")!.tags
    fireEvent.click(within(card).getByRole("button", { name: "编辑标签" }))

    const dialog = await screen.findByRole("dialog", { name: "编辑标签" })
    fireEvent.change(within(dialog).getByLabelText("标签"), { target: { value: "远程友好" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "添加标签" }))
    expect(within(dialog).getByText("远程友好")).toBeInTheDocument()

    const removeButtons = within(dialog).getAllByRole("button", { name: /^删除标签/ })
    fireEvent.click(removeButtons[0])
    fireEvent.click(within(dialog).getByRole("button", { name: "保存标签" }))

    await waitFor(() => expect(calls.patches).toHaveLength(1))
    const tags = calls.patches[0].body.tags as string[]
    expect(tags).toContain("远程友好")
    expect(tags).not.toContain(originalTags[0])
    expect(tags).toHaveLength(originalTags.length)

    // 卡片与筛选工具条都会渲染标签，断言限定在卡片内。
    const updatedCard = await cardFor("产品经理转型简历")
    await waitFor(() => expect(within(updatedCard).getByText("远程友好")).toBeInTheDocument())
    expect(within(updatedCard).queryByText(originalTags[0])).not.toBeInTheDocument()
  }, APP_MOUNT_TEST_TIMEOUT_MS)
})

describe("简历库卡片：删除入口与确认弹窗", () => {
  it("删除先弹确认，取消不删；确认后 DELETE 并从列表消失", async () => {
    const { handlers, calls } = storeHandlers()
    server.use(...handlers)

    renderLibrary()
    const card = await cardFor("高级前端工程师简历")
    fireEvent.click(within(card).getByRole("button", { name: "删除" }))

    let dialog = await screen.findByRole("dialog", { name: "删除这份简历？" })
    expect(within(dialog).getByText(/高级前端工程师简历/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除这份简历？" })).not.toBeInTheDocument())
    expect(calls.deletes).toEqual([])
    expect(screen.getByRole("link", { name: "高级前端工程师简历" })).toBeInTheDocument()

    fireEvent.click(within(await cardFor("高级前端工程师简历")).getByRole("button", { name: "删除" }))
    dialog = await screen.findByRole("dialog", { name: "删除这份简历？" })
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }))

    await waitFor(() => expect(calls.deletes).toEqual(["res_fe_lead"]))
    await waitFor(() => expect(screen.queryByRole("link", { name: "高级前端工程师简历" })).not.toBeInTheDocument())
  }, APP_MOUNT_TEST_TIMEOUT_MS)
})
