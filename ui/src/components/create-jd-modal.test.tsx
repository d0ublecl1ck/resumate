import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiRequestError } from "@/lib/api-client"
import { CreateJdDialogView, CreateJdModal, type CreateJdDialogViewProps } from "@/components/create-jd-modal"
import type { ProposedJd } from "@/lib/types"

const parseJdFromText = vi.fn()
vi.mock("@/lib/api", () => ({
  parseJdFromText: (text: string) => parseJdFromText(text),
  parseJdFromImage: vi.fn(),
  createJd: vi.fn(),
}))

afterEach(() => {
  cleanup()
  parseJdFromText.mockReset()
})

const DRAFT: ProposedJd = {
  role: "高级前端工程师", // i18n-allow: 测试演示数据（用户内容不翻译）
  company: "美团", // i18n-allow: 测试演示数据
  tags: ["前端", "性能优化"], // i18n-allow: 测试演示数据
  body: "负责核心交易链路的前端架构与性能优化。", // i18n-allow: 测试演示数据
  sourceUrl: "https://example.com/jobs/1",
  extracted: [],
  parseConfidence: 0.86,
  note: "已从粘贴文本中提取岗位、公司与标签。请核对后创建。", // i18n-allow: 后端返回的用户提示原文
  inputSource: "text",
}

function viewProps(overrides: Partial<CreateJdDialogViewProps> = {}): CreateJdDialogViewProps {
  const base: CreateJdDialogViewProps = {
    mode: "text",
    onModeChange: () => {},
    text: "高级前端工程师 · 美团", // i18n-allow: 测试演示数据
    onTextChange: () => {},
    parsing: false,
    onTextParse: () => {},
    onImageParse: () => {},
    draft: null,
    onDraftChange: () => {},
    onResetDraft: () => {},
    error: null,
    onRetry: () => {},
    onClose: () => {},
    onCreate: () => {},
    creating: false,
    imageName: null,
    imagePreview: null,
    onPickImage: () => {},
  }
  return Object.assign(base, overrides)
}

describe("CreateJdDialogView 输入 / 整理中", () => {
  it("输入态：有文本时「AI 整理」可用", () => {
    render(<CreateJdDialogView {...viewProps()} />)
    expect(screen.getByRole("dialog", { name: "新增 JD" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeEnabled()
  })

  it("输入态：无文本时「AI 整理」禁用", () => {
    render(<CreateJdDialogView {...viewProps({ text: "" })} />)
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeDisabled()
  })

  it("整理中：按钮禁用并显示「整理中…」", () => {
    render(<CreateJdDialogView {...viewProps({ parsing: true })} />)
    const button = screen.getByRole("button", { name: "整理中…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })
})

describe("CreateJdDialogView 成功草案", () => {
  it("展示可编辑草案与「重新整理」/「创建 JD」", () => {
    render(<CreateJdDialogView {...viewProps({ draft: DRAFT })} />)
    expect(screen.getByText("AI 整理结果（可编辑）")).toBeInTheDocument()
    expect(screen.getByDisplayValue("高级前端工程师")).toBeInTheDocument()
    expect(screen.getByDisplayValue("美团")).toBeInTheDocument()
    expect(screen.getByText("解析置信度 86%")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重新整理" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "创建 JD" })).toBeInTheDocument()
  })
})

describe("CreateJdDialogView 失败态", () => {
  it("模型未配置：给「去设置模型」，不给「重试」，不泄露机器码", () => {
    render(<CreateJdDialogView {...viewProps({ error: "MODEL_NOT_CONFIGURED", onOpenSettings: () => {} })} />)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("整理失败")
    expect(alert).toHaveTextContent("还没有配置模型，先去设置里选一个再整理。")
    expect(screen.getByRole("button", { name: "去设置模型" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
    expect(screen.queryByText(/MODEL_NOT_CONFIGURED/)).not.toBeInTheDocument()
  })

  it("解析超时：给可点「重试」", () => {
    render(<CreateJdDialogView {...viewProps({ error: "UPSTREAM_TIMEOUT" })} />)
    expect(screen.getByRole("alert")).toHaveTextContent("解析超时，请重试。")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })

  it("模型输出非法 JSON：给可点「重试」", () => {
    render(<CreateJdDialogView {...viewProps({ error: "MODEL_OUTPUT_INVALID" })} />)
    expect(screen.getByRole("alert")).toHaveTextContent("模型返回无法解析，请重试。")
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })
})

function renderModal() {
  return render(
    <MemoryRouter initialEntries={["/jds"]}>
      <Routes>
        <Route path="/jds" element={<CreateJdModal open onClose={() => {}} onCreated={() => {}} />} />
        <Route path="/settings" element={<div>settings-page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("CreateJdModal 容器失败接线", () => {
  it("解析抛 MODEL_NOT_CONFIGURED 时映射为 i18n 文案，不透出后端原文", async () => {
    parseJdFromText.mockRejectedValueOnce(new ApiRequestError("MODEL_NOT_CONFIGURED", "backend raw english message", 409))
    renderModal()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "高级前端工程师" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("还没有配置模型，先去设置里选一个再整理。")
    expect(alert).not.toHaveTextContent("backend raw english message")
    expect(screen.getByRole("button", { name: "AI 整理" })).toBeEnabled()
  })

  it("「去设置模型」真的导航到 /settings", async () => {
    parseJdFromText.mockRejectedValueOnce(new ApiRequestError("MODEL_NOT_CONFIGURED", "raw", 409))
    renderModal()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "高级前端工程师" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    fireEvent.click(await screen.findByRole("button", { name: "去设置模型" }))
    expect(await screen.findByText("settings-page")).toBeInTheDocument()
  })

  it("解析超时映射为「解析超时，请重试。」且不泄露机器码", async () => {
    parseJdFromText.mockRejectedValueOnce(new ApiRequestError("UPSTREAM_TIMEOUT", "raw", 504))
    renderModal()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "高级前端工程师" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("解析超时，请重试。")
    expect(screen.queryByText(/UPSTREAM_TIMEOUT/)).not.toBeInTheDocument()
  })

  it("解析成功后展示草案", async () => {
    parseJdFromText.mockResolvedValueOnce(DRAFT)
    renderModal()
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "高级前端工程师" } })
    fireEvent.click(screen.getByRole("button", { name: "AI 整理" }))
    await waitFor(() => expect(screen.getByText("AI 整理结果（可编辑）")).toBeInTheDocument())
  })
})
