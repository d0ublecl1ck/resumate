import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { JdTuning } from "@/components/jd-tuning"
import { JDS, RESUMES } from "@/lib/content"
import { server } from "@/test-server"
import type { JobDescription } from "@/lib/types"

afterEach(cleanup)

const MATCH = {
  results: [
    { factId: "fact_perf", factTitle: "商详页性能优化", relevance: 0.94, reason: "性能优化, 首屏", evidenceStatus: "verified" },
  ],
  gaps: [
    { requirement: "主导性能优化", status: "covered", note: "商详页性能优化" },
    { requirement: "跨端小程序经验", status: "missing", note: "" },
  ],
}

/** JdTuning 挂载即触发岗位匹配，所有用例都要先接住这个请求。 */
function matchHandler() {
  return http.post("/api/profile/match-job", () => HttpResponse.json(MATCH))
}

function renderJd(jd: JobDescription = JDS[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/jds/${jd.id}`]}>
        <JdTuning jd={jd} resumes={RESUMES} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("JD 详情：编辑生成新 revision", () => {
  it("点「编辑」出现表单，保存时 PATCH /jds/{id}", async () => {
    server.use(matchHandler())
    let patchBody: Record<string, unknown> | null = null
    let patchPath: string | null = null
    server.use(
      http.patch("/api/jds/:id", async ({ params, request }) => {
        patchPath = params.id as string
        patchBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...JDS[0], revision: 2 })
      }),
    )

    renderJd()
    fireEvent.click(screen.getByRole("button", { name: "编辑（生成新 revision）" }))

    const dialog = await screen.findByRole("dialog", { name: "编辑 JD" })
    fireEvent.change(within(dialog).getByLabelText("岗位名称"), { target: { value: "资深前端工程师" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "保存并生成新 revision" }))

    await waitFor(() => expect(patchPath).toBe("jd_meituan"))
    expect(patchBody).toMatchObject({ role: "资深前端工程师" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑 JD" })).not.toBeInTheDocument())
  })

  it("编辑弹窗可取消，不发出 PATCH", async () => {
    server.use(matchHandler())
    let patched = false
    server.use(
      http.patch("/api/jds/:id", () => {
        patched = true
        return HttpResponse.json(JDS[0])
      }),
    )

    renderJd()
    fireEvent.click(screen.getByRole("button", { name: "编辑（生成新 revision）" }))
    const dialog = await screen.findByRole("dialog", { name: "编辑 JD" })
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑 JD" })).not.toBeInTheDocument())
    expect(patched).toBe(false)
  })
})

describe("JD 详情：删除入口", () => {
  it("删除需确认，取消不发请求，确认后 DELETE /jds/{id}", async () => {
    server.use(matchHandler())
    const deletes: string[] = []
    server.use(
      http.delete("/api/jds/:id", ({ params }) => {
        deletes.push(params.id as string)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderJd()
    fireEvent.click(screen.getByRole("button", { name: "删除 JD" }))
    let dialog = await screen.findByRole("dialog", { name: "删除这个 JD？" })
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除这个 JD？" })).not.toBeInTheDocument())
    expect(deletes).toEqual([])

    fireEvent.click(screen.getByRole("button", { name: "删除 JD" }))
    dialog = await screen.findByRole("dialog", { name: "删除这个 JD？" })
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }))
    await waitFor(() => expect(deletes).toEqual(["jd_meituan"]))
  })
})

describe("JD 详情：解绑入口", () => {
  it("已绑定时出现「解除绑定」，点击 DELETE /jds/{id}/binding", async () => {
    server.use(matchHandler())
    let released = false
    server.use(
      http.delete("/api/jds/:id/binding", () => {
        released = true
        return HttpResponse.json({ ...JDS[0], boundResumeId: null, boundResumeAvailable: null })
      }),
    )

    renderJd({ ...JDS[0], boundResumeId: "res_fe_lead", boundResumeAvailable: true })
    fireEvent.click(screen.getByRole("button", { name: "解除绑定" }))

    await waitFor(() => expect(released).toBe(true))
  })

  it("未绑定时不显示「解除绑定」", () => {
    server.use(matchHandler())
    renderJd({ ...JDS[0], boundResumeId: undefined, boundResumeAvailable: undefined })

    expect(screen.queryByRole("button", { name: "解除绑定" })).not.toBeInTheDocument()
  })
})

describe("JD 详情：岗位匹配区块", () => {
  it("挂载后用确定性规则结果渲染匹配事实与要求覆盖", async () => {
    server.use(matchHandler())
    renderJd()

    expect(await screen.findByText("商详页性能优化")).toBeInTheDocument()
    expect(screen.getByText("岗位匹配")).toBeInTheDocument()
    expect(screen.getByText("主导性能优化")).toBeInTheDocument()
    expect(screen.getByText("跨端小程序经验")).toBeInTheDocument()
    expect(screen.getByText("已覆盖")).toBeInTheDocument()
    expect(screen.getByText("缺失")).toBeInTheDocument()
  })

  it("匹配失败展示 i18n 文案，不透出后端 message", async () => {
    server.use(
      http.post("/api/profile/match-job", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )
    renderJd()

    expect(await screen.findByText("匹配失败，请稍后重试。")).toBeInTheDocument()
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
  })
})

function RunProbe() {
  const location = useLocation()
  return <div data-testid="run-route">{location.pathname + location.search}</div>
}

describe("JD 详情：发起微调创建真实 Agent run", () => {
  function renderForLaunch(jd: JobDescription = JDS[0]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/jds/${jd.id}`]}>
          <Routes>
            <Route path="/jds/:id" element={<JdTuning jd={jd} resumes={RESUMES} />} />
            <Route path="/resumes/:id" element={<RunProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it("direct：POST /resumes/{id}/runs，prompt 带 JD revision 与正文并跳到 Run 面板", async () => {
    server.use(matchHandler())
    let runPath = ""
    let runBody: Record<string, unknown> | null = null
    server.use(
      http.post("/api/resumes/:id/runs", async ({ params, request }) => {
        runPath = params.id as string
        runBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: "run_1", status: "running" }, { status: 202 })
      }),
    )

    renderForLaunch()
    fireEvent.click(screen.getByRole("button", { name: "发起岗位微调" }))

    await waitFor(() => expect(runPath).toBe("res_fe_lead"))
    expect(String(runBody!.prompt)).toContain(`rev.${JDS[0].revision}`)
    expect(String(runBody!.prompt)).toContain(JDS[0].body)
    expect(await screen.findByTestId("run-route")).toHaveTextContent("/resumes/res_fe_lead?panel=run")
  })

  it("rebind：勾选后先 PUT /jds/{id}/binding，再起 run", async () => {
    server.use(matchHandler())
    let bindPath = ""
    let bindBody: Record<string, unknown> | null = null
    let runPath = ""
    server.use(
      http.put("/api/jds/:id/binding", async ({ params, request }) => {
        bindPath = params.id as string
        bindBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...JDS[0], boundResumeId: "res_fe_lead" })
      }),
      http.post("/api/resumes/:id/runs", ({ params }) => {
        runPath = params.id as string
        return HttpResponse.json({ runId: "run_2", status: "running" }, { status: 202 })
      }),
    )

    renderForLaunch()
    fireEvent.click(screen.getByLabelText("同时把此简历显式绑定为该 JD 的当前绑定"))
    fireEvent.click(screen.getByRole("button", { name: "发起岗位微调" }))

    await waitFor(() => expect(bindPath).toBe("jd_meituan"))
    expect(bindBody).toEqual({ resumeId: "res_fe_lead" })
    await waitFor(() => expect(runPath).toBe("res_fe_lead"))
  })

  it("copy：先复制简历，再在副本上起 run", async () => {
    server.use(matchHandler())
    let duplicated = false
    let runPath = ""
    server.use(
      http.post("/api/resumes/:id/duplicate", () => {
        duplicated = true
        return HttpResponse.json({ ...RESUMES[0], id: "res_copy" }, { status: 201 })
      }),
      http.post("/api/resumes/:id/runs", ({ params }) => {
        runPath = params.id as string
        return HttpResponse.json({ runId: "run_3", status: "running" }, { status: 202 })
      }),
    )

    renderForLaunch()
    fireEvent.click(screen.getByRole("button", { name: /复制后微调/ }))
    fireEvent.click(screen.getByRole("button", { name: "确认复制并发起微调" }))

    await waitFor(() => expect(duplicated).toBe(true))
    await waitFor(() => expect(runPath).toBe("res_copy"))
    expect(await screen.findByTestId("run-route")).toHaveTextContent("/resumes/res_copy?panel=run")
  })

  it("startRun 429 映射 i18n，不透出服务端原文", async () => {
    server.use(matchHandler())
    server.use(
      http.post("/api/resumes/:id/runs", () =>
        HttpResponse.json({ code: "RATE_LIMITED", message: "raw-backend-run-message-should-not-leak" }, { status: 429 }),
      ),
    )

    renderForLaunch()
    fireEvent.click(screen.getByRole("button", { name: "发起岗位微调" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("已有微调任务在执行，请稍后再试。")
    expect(alert).not.toHaveTextContent("raw-backend-run-message-should-not-leak")
  })
})
