// SCR-003 简历编辑页的 active-run 查询契约与整页 Loading 门。
// 缺陷复现：没有 open 轮次时 getActiveRun 返回 undefined，React Query v5 拒绝 undefined，
// 查询永远进不了 success；start 之后的 invalidate 让整页回退 PageLoading，卸载 RunPanel 丢状态。
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import i18n from "@/i18n"
import { ResumeEditorPage } from "@/pages/resume-editor"
import { server } from "@/test-server"

const LOADING = i18n.t("common.pageState.loading")
const EMPTY = i18n.t("workbench.run.empty")
const INPUT = i18n.t("workbench.run.inputAria")

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage(id: string, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/resumes/${id}`]}>
        <Routes>
          <Route path="/resumes/:id" element={<ResumeEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe("简历编辑页 active-run 查询", () => {
  it("没有 open 轮次时进入 success（data=null），且不报 Query data cannot be undefined", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const client = newClient()
    renderPage("res_pm_pivot", client)

    await screen.findByText(EMPTY)

    const state = client.getQueryState(["active-run", "res_pm_pivot"])
    expect(state?.status).toBe("success")
    expect(state?.data).toBeNull()
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("Query data cannot be undefined")
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it("窗口聚焦触发的后台 refetch 不回退整页 Loading，RunPanel 输入保留", async () => {
    focusManager.setFocused(true)
    const client = newClient()
    renderPage("res_pm_pivot", client)

    const input = await screen.findByRole("textbox", { name: INPUT })
    fireEvent.change(input, { target: { value: "聚焦保留" } })

    // 让聚焦触发的 refetch 停在 in-flight，才能断言「刷新期间」的页面状态。
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get("/api/resumes/:id/turns", async () => {
        await gate
        return HttpResponse.json([])
      }),
    )

    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await Promise.resolve()
    })

    expect(client.getQueryState(["active-run", "res_pm_pivot"])?.fetchStatus).toBe("fetching")
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: INPUT })).toHaveValue("聚焦保留")

    release()
    await waitFor(() => expect(client.getQueryState(["active-run", "res_pm_pivot"])?.fetchStatus).toBe("idle"))
  })

  it("后台刷新把 active-run 打回 pending 时也不回退整页 Loading", async () => {
    const client = newClient()
    renderPage("res_pm_pivot", client)

    const input = await screen.findByRole("textbox", { name: INPUT })
    fireEvent.change(input, { target: { value: "刷新中保留" } })

    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get("/api/resumes/:id/turns", async () => {
        await gate
        return HttpResponse.json([])
      }),
    )

    await act(async () => {
      void client.resetQueries({ queryKey: ["active-run", "res_pm_pivot"] })
      await Promise.resolve()
    })

    expect(client.getQueryState(["active-run", "res_pm_pivot"])?.status).toBe("pending")
    expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: INPUT })).toHaveValue("刷新中保留")

    release()
    await waitFor(() => expect(client.getQueryState(["active-run", "res_pm_pivot"])?.fetchStatus).toBe("idle"))
  })
})
