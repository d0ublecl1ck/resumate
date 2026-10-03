import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import App from "@/App"
import { RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { Resume } from "@/lib/types"

afterEach(cleanup)

const CLONE_ID = "res_cloned_from_list"

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
