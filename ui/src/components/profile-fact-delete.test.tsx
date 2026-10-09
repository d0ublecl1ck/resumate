import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { ProfileWorkspace } from "@/components/profile-workspace"
import { PROFILE } from "@/lib/content"
import { server } from "@/test-server"
import type { Profile, ProfileFact } from "@/lib/types"

afterEach(cleanup)

const REFERENCED: ProfileFact = {
  ...PROFILE.facts[0],
  id: "fact_referenced",
  title: "被引用的事实",
  referencedBy: [{ resumeId: "res_1", resumeTitle: "引用它的简历", versionId: "ver_1" }],
}
const STANDALONE: ProfileFact = {
  ...PROFILE.facts[0],
  id: "fact_standalone",
  title: "独立事实",
  referencedBy: [],
}
const PROFILE_WITH_FACTS: Profile = { ...PROFILE, facts: [REFERENCED, STANDALONE] }

function renderProfile(profile: Profile = PROFILE_WITH_FACTS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/profile"]}>
        <ProfileWorkspace profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function deleteHandler(deleted: string[]) {
  return http.delete("/api/profile/facts/:id", ({ params }) => {
    deleted.push(params.id as string)
    return HttpResponse.json({ factId: params.id, referencedBy: [] })
  })
}

describe("Profile 事实删除入口", () => {
  it("删除前弹确认并展示反向引用影响，取消不删", async () => {
    const deleted: string[] = []
    server.use(deleteHandler(deleted))

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "删除「被引用的事实」" }))

    const dialog = await screen.findByRole("dialog", { name: "删除这条事实？" })
    expect(within(dialog).getByText("以下简历版本引用了这条事实：")).toBeInTheDocument()
    expect(within(dialog).getByText("引用它的简历")).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除这条事实？" })).not.toBeInTheDocument())
    expect(deleted).toEqual([])
    expect(screen.getByRole("heading", { name: "被引用的事实" })).toBeInTheDocument()
  })

  it("确认后 DELETE 该事实并从页面移除，其它事实保留", async () => {
    const deleted: string[] = []
    server.use(deleteHandler(deleted))

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "删除「被引用的事实」" }))
    const dialog = await screen.findByRole("dialog", { name: "删除这条事实？" })
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }))

    await waitFor(() => expect(deleted).toEqual(["fact_referenced"]))
    await waitFor(() => expect(screen.queryByRole("heading", { name: "被引用的事实" })).not.toBeInTheDocument())
    expect(screen.getByRole("heading", { name: "独立事实" })).toBeInTheDocument()
  })

  it("无反向引用时提示没有被任何简历引用", async () => {
    server.use(deleteHandler([]))

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "删除「独立事实」" }))

    const dialog = await screen.findByRole("dialog", { name: "删除这条事实？" })
    expect(within(dialog).getByText("没有被任何简历引用。")).toBeInTheDocument()
  })

  it("删除失败时就地展示 i18n 文案，不透出后端 message，事实仍在", async () => {
    server.use(
      http.delete("/api/profile/facts/:id", () =>
        HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "raw-backend-message-should-not-leak" }, { status: 404 }),
      ),
    )

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "删除「独立事实」" }))
    const dialog = await screen.findByRole("dialog", { name: "删除这条事实？" })
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("删除失败，请稍后重试。")
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
    // 弹窗仍打开，背景因 inert 不在可访问树里；用文本查询确认事实未被移除。
    expect(screen.getByText("独立事实")).toBeInTheDocument()
  })
})
