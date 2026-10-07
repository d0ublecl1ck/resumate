import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import App from "@/App"
import { RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

const CLONE_ID = "res_cloned_from_list"

// 本文件用例都 render(<App/>)，等待的是完整路由挂载：RequireAuth 先解析当前用户，
// 通过后才挂载 ResumesPage，后者并发拉取 active / archived / templates / jds 四个查询，
// 四个都 resolve 后才渲染出列表卡片。这是一次真正的异步挂载，Testing Library 默认的
// 1s asyncUtilTimeout 只是“通常够快”的经验值；CPU 被抢占时整条链路会超过 1s，
// 断言会在页面仍停留在 PageLoading 时超时。这里给等待显式预算，并把承载整页挂载的
// 用例的单测超时抬到预算之上，避免 vitest 默认 5s 提前截断等待。
const APP_MOUNT_TIMEOUT_MS = 10_000
const APP_MOUNT_TEST_TIMEOUT_MS = 30_000

function clone(): Resume {
  return { ...RESUMES[0], id: CLONE_ID, title: "高级前端工程师简历（副本）" }
}

const notFound = () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "简历不存在" }, { status: 404 })

function renderLibrary() {
  window.history.pushState({}, "", "/resumes")
  return render(<App />)
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
    const copyButtons = await screen.findAllByRole("button", { name: "复制" }, { timeout: APP_MOUNT_TIMEOUT_MS })
    fireEvent.click(copyButtons[0])

    await waitFor(() => expect(duplicatePath).toBe("res_fe_lead"), { timeout: APP_MOUNT_TIMEOUT_MS })
    await waitFor(() => expect(window.location.pathname).toBe(`/resumes/${CLONE_ID}`), { timeout: APP_MOUNT_TIMEOUT_MS })
    expect(await screen.findByRole("heading", { name: "高级前端工程师简历（副本）" }, { timeout: APP_MOUNT_TIMEOUT_MS })).toBeInTheDocument()
  }, APP_MOUNT_TEST_TIMEOUT_MS)

  it("复制失败时就地展示 i18n 文案，不透出后端 message，也不跳转", async () => {
    server.use(
      http.post("/api/resumes/:id/duplicate", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderLibrary()
    const copyButtons = await screen.findAllByRole("button", { name: "复制" }, { timeout: APP_MOUNT_TIMEOUT_MS })
    fireEvent.click(copyButtons[0])

    expect(await screen.findByRole("alert", {}, { timeout: APP_MOUNT_TIMEOUT_MS })).toHaveTextContent("选中的原简历已不存在，请刷新后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    expect(window.location.pathname).toBe("/resumes")
  }, APP_MOUNT_TEST_TIMEOUT_MS)
})

describe("简历库：网格卡片布局", () => {
  it("列表是 sm:2 / xl:3 网格，卡片纵向排布且操作区用 mt-auto 贴底", async () => {
    renderLibrary()

    const card = (await screen.findByRole("link", { name: "高级前端工程师简历" }, { timeout: APP_MOUNT_TIMEOUT_MS })).closest("li")
    expect(card).not.toBeNull()
    expect(card).toHaveClass("flex-col")

    const list = card!.parentElement
    expect(list?.tagName).toBe("UL")
    expect(list).toHaveClass("lg:grid-cols-2")
    expect(list).toHaveClass("xl:grid-cols-3")

    // jsdom 不算布局，这里用 mt-auto 契约守住「操作区贴底、同排卡片按钮对齐」。
    expect(card!.querySelector(".mt-auto")).not.toBeNull()
  }, APP_MOUNT_TEST_TIMEOUT_MS)

  it("归档卡片保留归档徽标且操作文案是恢复", async () => {
    renderLibrary()
    // 「归档」既是页签也是卡片操作：页签在 DOM 中先出现，这里精确点页签。
    const archiveButtons = await screen.findAllByRole("button", { name: "归档" }, { timeout: APP_MOUNT_TIMEOUT_MS })
    fireEvent.click(archiveButtons[0])

    const card = (await screen.findByRole("link", { name: "实习生简历（旧）" }, { timeout: APP_MOUNT_TIMEOUT_MS })).closest("li")
    expect(card).not.toBeNull()
    expect(card!).toHaveTextContent("已归档")
    expect(card!).toHaveTextContent("恢复")
  }, APP_MOUNT_TEST_TIMEOUT_MS)
})
