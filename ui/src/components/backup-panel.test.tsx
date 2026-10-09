// 备份导入预览：资源类型本地化、真模态焦点契约、校验错误出口与空态。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BackupPanel } from "@/components/backup-panel"
import { IMPORT_PREVIEW_SAMPLE } from "@/lib/content"
import { server } from "@/test-server"
import type { ImportPreview } from "@/lib/types"

afterEach(cleanup)

const PREVIEW_URL = /\/api\/backup\/import:preview$/

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BackupPanel />
    </QueryClientProvider>,
  )
}

function backupFile(payload: unknown, name = "resumate-backup.json") {
  return new File([JSON.stringify(payload)], name, { type: "application/json" })
}

function upload(file: File) {
  fireEvent.change(screen.getByLabelText("选择备份文件并校验"), { target: { files: [file] } })
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return { ...IMPORT_PREVIEW_SAMPLE, ...overrides }
}

describe("BackupPanel 导入预览资源类型", () => {
  it("新增资源显示中文类型，不直出后端枚举", async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(preview())))
    renderPanel()
    upload(backupFile({ formatVersion: "resumate-backup/1.0", resources: {} }))

    const dialog = await screen.findByRole("dialog", { name: "导入预览" })
    expect(within(dialog).getByText("个人资料")).toBeInTheDocument()
    expect(within(dialog).getByText("简历")).toBeInTheDocument()
    expect(within(dialog).getByText("岗位")).toBeInTheDocument()
    expect(within(dialog).queryByText("Profile")).not.toBeInTheDocument()
    expect(within(dialog).queryByText("Resume")).not.toBeInTheDocument()
    expect(within(dialog).queryByText("JD")).not.toBeInTheDocument()
  })
})

describe("BackupPanel 导入预览模态焦点管理", () => {
  it("打开后焦点进入弹窗、Tab/Shift+Tab 不逃逸、Esc 关闭并归还焦点、背景 inert", async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(preview())))
    const { container } = renderPanel()
    const trigger = screen.getByRole("button", { name: "选择备份文件并校验" })
    trigger.focus()

    upload(backupFile({ formatVersion: "resumate-backup/1.0", resources: {} }))
    const dialog = await screen.findByRole("dialog", { name: "导入预览" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
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
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(container).not.toHaveAttribute("inert")
  })

  it("触发按钮在打开前失焦（模拟请求期间 disabled）时，关闭后仍把焦点归还它", async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(preview())))
    renderPanel()
    const trigger = screen.getByRole("button", { name: "选择备份文件并校验" })
    trigger.focus()
    expect(trigger).toHaveFocus()
    // 请求挂起期间按钮被 disabled，浏览器会把焦点移到 body
    trigger.blur()
    expect(document.activeElement).toBe(document.body)

    upload(backupFile({ formatVersion: "resumate-backup/1.0", resources: {} }))
    const dialog = await screen.findByRole("dialog", { name: "导入预览" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})

describe("BackupPanel 校验失败出口", () => {
  it("业务校验失败渲染后端 message", async () => {
    server.use(
      http.post(PREVIEW_URL, () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "不支持的备份格式版本：'nope'" }, { status: 422 }),
      ),
    )
    renderPanel()
    upload(backupFile({ formatVersion: "nope", resources: {} }, "bad.json"))

    expect(await screen.findByText("不支持的备份格式版本：'nope'")).toBeInTheDocument()
  })

  it("500 不显示原始报错，仍用通用文案", async () => {
    server.use(
      http.post(PREVIEW_URL, () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "raw-backend-message-should-not-leak" }, { status: 500 }),
      ),
    )
    renderPanel()
    upload(backupFile({ formatVersion: "nope", resources: {} }, "bad.json"))

    expect(await screen.findByText("校验失败")).toBeInTheDocument()
    expect(screen.queryByText(/raw-backend-message-should-not-leak/)).not.toBeInTheDocument()
  })
})

describe("BackupPanel 绑定关系恢复空态", () => {
  it("bindingRestores 为空时不渲染区块", async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(preview({ bindingRestores: [] }))))
    renderPanel()
    upload(backupFile({ formatVersion: "resumate-backup/1.0", resources: {} }))

    const dialog = await screen.findByRole("dialog", { name: "导入预览" })
    expect(within(dialog).queryByText("绑定关系恢复")).not.toBeInTheDocument()
  })
})

describe("BackupPanel 死按钮与导入说明", () => {
  it("不再渲染已下线的「下载证据附件」死按钮", () => {
    renderPanel()
    expect(screen.queryByRole("button", { name: "下载证据附件" })).not.toBeInTheDocument()
  })

  it("导入说明不再承诺 ID 映射，改为与弹窗一致的表述", () => {
    renderPanel()
    expect(screen.queryByText(/ID 映射/)).not.toBeInTheDocument()
    expect(screen.getByText(/绑定关系恢复/)).toBeInTheDocument()
  })
})

describe("BackupPanel 导入预览同名资源", () => {
  it("同名同类型资源不触发 React duplicate key 警告", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    server.use(
      http.post(PREVIEW_URL, () =>
        HttpResponse.json(
          preview({
            newResources: [
              { type: "Resume", title: "同名简历" },
              { type: "Resume", title: "同名简历" },
              { type: "JD", title: "同名岗位" },
              { type: "JD", title: "同名岗位" },
            ],
          }),
        ),
      ),
    )
    renderPanel()
    upload(backupFile({ formatVersion: "resumate-backup/1.0", resources: {} }))

    const dialog = await screen.findByRole("dialog", { name: "导入预览" })
    await waitFor(() => expect(within(dialog).getAllByRole("listitem").length).toBeGreaterThan(0))
    const rendered = within(dialog)
      .getAllByRole("listitem")
      .filter((item) => (item.textContent ?? "").includes("同名简历")).length
    const dupKeyWarnings = spy.mock.calls.filter((call) => String(call[0]).includes("same key"))
    expect(rendered, `同名资源渲染条数=${rendered}`).toBe(2)
    spy.mockRestore()

    expect(dupKeyWarnings).toHaveLength(0)
  })
})
