import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { ProfileWorkspace } from "./profile-workspace"
import { PROFILE } from "@/lib/content"

afterEach(cleanup)

function renderProfile() {
  return render(
    <MemoryRouter>
      <ProfileWorkspace profile={PROFILE} />
    </MemoryRouter>,
  )
}

describe("ProfileWorkspace 直接编辑", () => {
  it("基本信息可直接编辑并保存", async () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))

    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "张沐沐" } })
    fireEvent.change(screen.getByLabelText("城市"), { target: { value: "北京" } })
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }))

    expect(await screen.findByRole("heading", { name: "张沐沐" })).toBeInTheDocument()
    expect(screen.getByText("北京")).toBeInTheDocument()
  })

  it("可通过手动添加直接新增事实", async () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加技能专长" }))

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Rust 工程实践" } })
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "用 Rust 重写数据管道，吞吐提升 3 倍。" } })
    fireEvent.click(screen.getByRole("button", { name: "添加事实" }))

    expect(await screen.findByRole("heading", { name: "Rust 工程实践" })).toBeInTheDocument()
  })

  it("可直接修正已有事实", async () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑「商详页性能优化」" }))

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "商详页性能优化（复核）" } })
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    expect(await screen.findByRole("heading", { name: "商详页性能优化（复核）" })).toBeInTheDocument()
  })

  it("直接新增默认待核实", () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加证书资质" }))
    expect(screen.getByLabelText("证据状态")).toHaveValue("unverified")
  })

  it("对话入口只在页头，卡片上不重复", () => {
    renderProfile()
    expect(screen.getByRole("button", { name: "对话维护资料" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "对话编辑" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "对话添加职业经历" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "对话更新「商详页性能优化」" })).not.toBeInTheDocument()
    expect(screen.queryByText("对话添加")).not.toBeInTheDocument()
    expect(screen.queryByText("对话更新")).not.toBeInTheDocument()
  })

  it("直接编辑入口保留", () => {
    renderProfile()
    expect(screen.getByRole("button", { name: "编辑基本信息" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "手动添加职业经历" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "编辑「商详页性能优化」" })).toBeInTheDocument()
  })
})
