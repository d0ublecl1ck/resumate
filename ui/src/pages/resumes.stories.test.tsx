// 简历库 story 覆盖校验：删除临时演示组件后，每个目标态 story 都必须由真实页面渲染出来。
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  ActiveWithEmptyTargetRole,
  ArchivedEmpty,
  ArchivedTabTags,
  ArchivedWithCards,
  CopyPickerDialog,
  DeepLinkArchivedTagged,
  Default,
  Empty,
  FilteredEmpty,
  Grid,
  SearchCaseInsensitive,
} from "@/pages/resumes.stories"

afterEach(cleanup)

/** 「归档」既是页签也是卡片操作：页签是唯一带 aria-pressed 的按钮。 */
function tabButton(name: string): HTMLElement {
  const button = screen.getAllByRole("button", { name }).find((candidate) => candidate.hasAttribute("aria-pressed"))
  if (!button) throw new Error("找不到页签：" + name)
  return button
}

describe("简历库 story 状态覆盖", () => {
  it("Default 渲染真实 ResumesPage", async () => {
    render(Default.render())

    expect(await screen.findByRole("heading", { name: "简历库" })).toBeInTheDocument()
    expect(await screen.findByRole("link", { name: "高级前端工程师简历" })).toBeInTheDocument()
  })

  it("Grid 用真实卡片网格铺满 6 份简历", async () => {
    render(Grid.render())

    const card = (await screen.findAllByRole("link", { name: "高级前端工程师简历" }))[0].closest("li")
    const list = card?.parentElement as HTMLElement
    expect(list).toHaveClass("lg:grid-cols-2")
    expect(list).toHaveClass("xl:grid-cols-3")
    expect(list.querySelectorAll("li")).toHaveLength(6)
  })

  it("Empty 是活跃空态文案", async () => {
    render(Empty.render())

    expect(await screen.findByText("还没有简历")).toBeInTheDocument()
    expect(screen.getByText("点击右上角新建一份简历开始。")).toBeInTheDocument()
  })

  it("ActiveWithEmptyTargetRole 的空白岗位卡片不出现「岗位方向：」行", async () => {
    render(ActiveWithEmptyTargetRole.render())

    const card = (await screen.findByRole("link", { name: "未命名简历" })).closest("li") as HTMLElement
    expect(card).not.toHaveTextContent("岗位方向")
    expect(card).toHaveClass("flex-col")
  })

  it("ArchivedWithCards 是归档 Tab 有卡：徽标 + 恢复按钮", async () => {
    render(ArchivedWithCards.render())

    const card = (await screen.findByRole("link", { name: "实习生简历（旧）" })).closest("li") as HTMLElement
    expect(tabButton("归档")).toHaveAttribute("aria-pressed", "true")
    expect(card).toHaveTextContent("已归档")
    expect(within(card).getByRole("button", { name: "恢复" })).toBeInTheDocument()
  })

  it("ArchivedEmpty 用归档专用空态描述", async () => {
    render(ArchivedEmpty.render())

    expect(await screen.findByText("暂无归档简历")).toBeInTheDocument()
    expect(screen.getByText("归档的简历会保留在这里，恢复后可继续编辑。")).toBeInTheDocument()
    expect(screen.queryByText("点击右上角新建一份简历开始。")).not.toBeInTheDocument()
  })

  it("FilteredEmpty 保留搜索条件并显示筛选空态文案", async () => {
    render(FilteredEmpty.render())

    expect(await screen.findByText("没有匹配的简历")).toBeInTheDocument()
    expect(screen.getByLabelText("按标题或岗位搜索…")).toHaveValue("zzz")
  })

  it("ArchivedTabTags 的 chips 只含归档简历标签", async () => {
    render(ArchivedTabTags.render())

    expect(await screen.findByRole("button", { name: "实习" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "前端" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "产品" })).not.toBeInTheDocument()
  })

  it("SearchCaseInsensitive 用 qa 命中标题含 QA 的简历", async () => {
    render(SearchCaseInsensitive.render())

    expect(await screen.findByRole("link", { name: /QA/ })).toBeInTheDocument()
  })

  it("DeepLinkArchivedTagged 深链同时保持 tab 与 tag", async () => {
    render(DeepLinkArchivedTagged.render())

    expect(await screen.findByRole("button", { name: "实习" })).toHaveAttribute("aria-pressed", "true")
    expect(tabButton("归档")).toHaveAttribute("aria-pressed", "true")
    expect(await screen.findByRole("link", { name: "实习生简历（旧）" })).toBeInTheDocument()
  })

  it("CopyPickerDialog 渲染真实选择弹层（Modal 原语）", async () => {
    render(CopyPickerDialog.render())

    const dialog = await screen.findByRole("dialog", { name: "选择要复制的简历" })
    expect(within(dialog).getByRole("group", { name: "选择要复制的简历" })).toHaveClass("lg:grid-cols-3")
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument()
  })
})
