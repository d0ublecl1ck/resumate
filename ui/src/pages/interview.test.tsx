// SCR-014 模拟面试建会话页：提交成功跳转 + MODEL_NOT_CONFIGURED 中文引导（禁止英文原文泄漏）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import i18n from "@/i18n"
import { InterviewPage } from "@/pages/interview"
import { server } from "@/test-server"

const tr = (key: string) => String(i18n.t(key))

afterEach(cleanup)

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={newClient()}>
      <MemoryRouter initialEntries={["/interview"]}>
        <Routes>
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/interview/:id" element={<p>会话详情页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockOptions() {
  server.use(
    http.get("/api/resumes", () =>
      HttpResponse.json([{ id: "res_1", title: "前端工程师简历", lifecycle: "active" }]),
    ),
    http.get("/api/resumes/:id/versions", () => HttpResponse.json([{ id: "ver_1", message: "首个版本" }])),
    http.get("/api/jds", () => HttpResponse.json([{ id: "jd_1", role: "前端工程师", company: "示例公司" }])),
    http.get("/api/interview/sessions", () => HttpResponse.json([])),
  )
}

async function fillCreateForm() {
  await screen.findByRole("option", { name: "前端工程师简历" })
  fireEvent.change(screen.getByLabelText(tr("interviewWorkflow.create.resumeLabel")), { target: { value: "res_1" } })
  await screen.findByRole("option", { name: "首个版本" })
  fireEvent.change(screen.getByLabelText(tr("interviewWorkflow.create.versionLabel")), { target: { value: "ver_1" } })
  fireEvent.change(screen.getByLabelText(tr("interviewWorkflow.create.jdLabel")), { target: { value: "jd_1" } })
  await waitFor(() => expect(screen.getByLabelText(tr("interviewWorkflow.create.roleLabel"))).toHaveValue("前端工程师"))
}

describe("InterviewPage", () => {
  it("新建会话提交成功后跳转到会话页", async () => {
    mockOptions()
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post("/api/interview/sessions", async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            id: "sess_1",
            status: "active",
            role: "前端工程师",
            resumeId: "res_1",
            resumeVersionId: "ver_1",
            jdId: "jd_1",
            rubricVersion: "v1.0",
            contextSnapshot: {
              role: "前端工程师",
              resumeTitle: "前端工程师简历",
              resumeVersionId: "ver_1",
              jdRole: "前端工程师",
              jdCompany: "示例公司",
              jdBody: "",
            },
            questions: [],
            report: null,
            createdAt: "2026-10-09T10:00:00+08:00",
            updatedAt: "2026-10-09T10:00:00+08:00",
            completedAt: null,
          },
          { status: 201 },
        )
      }),
    )

    renderPage()
    await fillCreateForm()
    fireEvent.click(screen.getByRole("button", { name: tr("interviewWorkflow.create.submit") }))

    expect(await screen.findByText("会话详情页")).toBeInTheDocument()
    expect(posted).toMatchObject({
      resumeVersionId: "ver_1",
      jdId: "jd_1",
      role: "前端工程师",
      questionCount: 3,
    })
  })

  it("MODEL_NOT_CONFIGURED 时显示中文引导而不是英文原文", async () => {
    mockOptions()
    server.use(
      http.post("/api/interview/sessions", () =>
        HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "model provider is not configured" }, { status: 409 }),
      ),
    )

    renderPage()
    await fillCreateForm()
    fireEvent.click(screen.getByRole("button", { name: tr("interviewWorkflow.create.submit") }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(tr("interviewWorkflow.errors.MODEL_NOT_CONFIGURED"))
    expect(alert).not.toHaveTextContent("model provider is not configured")
    expect(screen.getByRole("link", { name: tr("interviewWorkflow.errors.openSettings") })).toBeInTheDocument()
  })
})
