// 复制选择层改用 ui/components/ui/modal.tsx 原语后的模态契约：
// Esc 关闭、焦点锁在弹层内、背景 inert（对辅助技术不可达），视觉要素（可达名 / 标题 / 描述 / 网格 / 底部按钮）保留。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { ResumePickerDialog } from "@/components/resume-picker-dialog"
import { RESUMES, TEMPLATES } from "@/lib/content"

afterEach(cleanup)

const ACTIVE = RESUMES.filter((resume) => resume.lifecycle === "active")

function renderPicker() {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const onSelect = vi.fn()
  const view = render(
    <ResumePickerDialog
      resumes={ACTIVE}
      selectedId={null}
      onSelect={onSelect}
      onCancel={onCancel}
      onConfirm={onConfirm}
      busy={false}
      error={null}
    />,
  )
  return { ...view, onCancel, onConfirm, onSelect }
}

describe("ResumePickerDialog：模态原语契约", () => {
  it("打开后焦点进入弹层、Tab/Shift+Tab 不逃逸、背景 inert、Esc 触发关闭", async () => {
    const { container, onCancel } = renderPicker()

    const dialog = await screen.findByRole("dialog", { name: "选择要复制的简历" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    // 背景被标记为 inert：键盘与辅助技术都无法穿到弹层外。
    expect(container).toHaveAttribute("inert")

    for (let index = 0; index < 12; index += 1) {
      fireEvent.keyDown(document.activeElement ?? document, { key: "Tab" })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    for (let index = 0; index < 12; index += 1) {
      fireEvent.keyDown(document.activeElement ?? document, { key: "Tab", shiftKey: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  })

  it("保留可达名、标题、描述、卡片网格与底部取消 / 确认按钮", async () => {
    renderPicker()

    const dialog = await screen.findByRole("dialog", { name: "选择要复制的简历" })
    expect(within(dialog).getByText("选择要复制的简历")).toBeInTheDocument()
    expect(within(dialog).getByText("选中一份简历，内容原样复制成新简历，标题自动加「（副本）」。")).toBeInTheDocument()

    const grid = within(dialog).getByRole("group", { name: "选择要复制的简历" })
    expect(grid).toHaveClass("sm:grid-cols-2")
    expect(grid).toHaveClass("lg:grid-cols-3")
    expect(within(grid).getAllByRole("button")).toHaveLength(ACTIVE.length)

    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "创建副本" })).toBeDisabled()
  })
})

describe("创建简历 Modal：选择层 Esc 关闭", () => {
  it("从创建弹窗进入选择层后按 Esc 可关闭，回到创建弹窗", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/resumes"]}>
          <CreateResumeModal open onClose={() => {}} resumes={RESUMES} templates={TEMPLATES} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "创建" }))
    expect(await screen.findByRole("dialog", { name: "选择要复制的简历" })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "选择要复制的简历" })).not.toBeInTheDocument(),
    )
    expect(await screen.findByRole("dialog", { name: "开始一份新的简历" })).toBeInTheDocument()
  })
})
