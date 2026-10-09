// 版本历史：恢复到历史版本必须真的调用后端并刷新（历史上确认按钮是空实现）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { VersionHistory } from "@/components/version-history"
import { server } from "@/test-server"
import type { Resume, ResumeVersion } from "@/lib/types"

afterEach(cleanup)

function version(id: string, message: string): ResumeVersion {
  return {
    id,
    source: "manual",
    actorId: "user_admin",
    startedAt: "2026-10-01T10:00:00+08:00",
    committedAt: "2026-10-01T10:00:00+08:00",
    message,
    changeCount: 1,
    affectedSections: ["工作经历"],
  }
}

function resumeFixture(): Resume {
  return {
    id: "res_e2e",
    title: "E2E 简历",
    targetRole: "前端工程师",
    tags: [],
    templateId: "tpl_classic",
    templateVersion: 1,
    currentVersionId: "ver_2",
    lifecycle: "active",
    saveState: "committed",
    updatedAt: "2026-10-01T10:00:00+08:00",
    boundByJdIds: [],
    document: {
      basics: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] },
      sections: [{ id: "sec_1", kind: "experience", title: "工作经历", entries: [] }],
    },
    versions: [version("ver_1", "创建简历"), version("ver_2", "手动编辑")],
  }
}

describe("版本历史恢复", () => {
  it("确认恢复会调用 POST /resumes/{id}/versions/{vid}/restore 并带上文案", async () => {
    const calls: { path: string; message?: string }[] = []
    server.use(
      http.post("/api/resumes/:id/versions/:versionId/restore", async ({ params, request }) => {
        const body = (await request.json()) as { message?: string }
        calls.push({ path: `${params.id}/${params.versionId}`, message: body.message })
        return HttpResponse.json({ ...resumeFixture(), currentVersionId: "ver_3" })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <VersionHistory resume={resumeFixture()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "恢复为新版本" }))
    fireEvent.click(await screen.findByRole("button", { name: "确认恢复为新版本" }))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].path).toBe("res_e2e/ver_1")
    expect(calls[0].message).toBeTruthy()
  })
})
