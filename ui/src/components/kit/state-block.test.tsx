import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { StateBlock } from "@/components/kit/state-block"

afterEach(cleanup)

describe("StateBlock", () => {
  it("renders the caller copy and the machine error code", () => {
    render(
      <StateBlock kind="error" title="简历不存在" description="换个筛选条件。" errorCode="RESUME_NOT_FOUND" />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("简历不存在")
    expect(screen.getByText("错误码：RESUME_NOT_FOUND")).toBeInTheDocument()
  })

  it("carries brand grammar and the mark instead of a generic icon circle", () => {
    const { container } = render(<StateBlock kind="empty" title="还没有简历" />)
    expect(container.querySelector('img[src="/brand/mark.png"]')).not.toBeNull()
  })

  it("announces conflicts as alerts too", () => {
    render(<StateBlock kind="conflict" title="改动撞车了" />)
    expect(screen.getByRole("alert")).toHaveTextContent("改动撞车了")
  })

  it("keeps the action slot reachable", () => {
    render(<StateBlock kind="forbidden" title="无权访问" action={<button type="button">申请权限</button>} />)
    expect(screen.getByRole("button", { name: "申请权限" })).toBeInTheDocument()
  })
})
