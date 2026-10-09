import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MarkdownMessage } from "@/components/kit/markdown"

afterEach(cleanup)

// 最小安全 Markdown：只处理标题 / 列表 / 加粗 / 行内 code / 引用。
// 断言必须覆盖「原始 HTML 不注入」，避免用 dangerouslySetInnerHTML 换实现时无人拦。
describe("MarkdownMessage", () => {
  it("渲染标题、列表、加粗、行内 code 与引用", () => {
    const { container } = render(
      <MarkdownMessage text={"## 性能优化\n\n- 首屏 **3.2s** → `1.1s`\n- 命中率 **92%**\n\n> 依据工作副本"} />,
    )

    expect(screen.getByRole("heading", { level: 4, name: "性能优化" })).toBeInTheDocument()
    expect(container.querySelector("ul")).not.toBeNull()
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.querySelector("strong")?.textContent).toBe("3.2s")
    expect(container.querySelector("code")?.textContent).toBe("1.1s")
    expect(container.querySelector("blockquote")).toHaveTextContent("依据工作副本")
  })

  it("有序列表渲染为 ol", () => {
    const { container } = render(<MarkdownMessage text={"1. 第一条\n2. 第二条"} />)

    expect(container.querySelector("ol")).not.toBeNull()
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("原始 HTML 只当纯文本，不注入 DOM", () => {
    const { container } = render(<MarkdownMessage text={"<script>alert(1)</script>"} />)

    expect(container.querySelector("script")).toBeNull()
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument()
  })

  it("不支持的语法保持原文", () => {
    render(<MarkdownMessage text={"*斜体* 与 | 表格 |"} />)

    expect(screen.getByText("*斜体* 与 | 表格 |")).toBeInTheDocument()
  })
})
