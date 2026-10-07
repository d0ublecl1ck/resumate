import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { ProfileWorkspace } from "./profile-workspace"
import { ProfileFactForm } from "./profile-fact-form"
import { PROFILE } from "@/lib/content"
import { FACT_TYPE_ORDER } from "@/lib/profile"
import { server } from "@/test-server"
import i18n from "@/i18n"

afterEach(cleanup)

function renderProfile(profile = PROFILE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfileWorkspace profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
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

  it("新增事实表单未提交时不显示校验错误", () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加技能专长" }))

    expect(screen.queryByText("标题与内容不能为空。")).not.toBeInTheDocument()
  })

  it("只填标题提交才显示校验错误，补齐内容后保存并消失", async () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加技能专长" }))
    expect(screen.queryByText("标题与内容不能为空。")).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Rust 工程实践" } })
    fireEvent.click(screen.getByRole("button", { name: "添加事实" }))
    expect(screen.getByText("标题与内容不能为空。")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "用 Rust 重写数据管道，吞吐提升 3 倍。" } })
    fireEvent.click(screen.getByRole("button", { name: "添加事实" }))

    expect(await screen.findByRole("heading", { name: "Rust 工程实践" })).toBeInTheDocument()
    expect(screen.queryByText("标题与内容不能为空。")).not.toBeInTheDocument()
  })
})

describe("ProfileWorkspace 的失败出口", () => {
  it("主档保存失败时给出可见可读错误与重试，且不产生未处理的 rejection", async () => {
    let patches = 0
    server.use(
      http.patch("/api/profile/basics", () => {
        patches += 1
        return HttpResponse.json({ code: "RATE_LIMITED", message: "runner busy" }, { status: 500 })
      }),
    )
    const rejections: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent) => rejections.push(event.reason)
    window.addEventListener("unhandledrejection", onUnhandled)

    try {
      renderProfile()
      fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))
      fireEvent.change(screen.getByLabelText("城市"), { target: { value: "北京" } })
      fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }))

      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent("保存失败")
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
      expect(patches).toBe(1)

      fireEvent.click(screen.getByRole("button", { name: "重试" }))
      await screen.findByRole("alert")

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(rejections).toEqual([])
    } finally {
      window.removeEventListener("unhandledrejection", onUnhandled)
    }
  })

  it("邮箱格式非法时拦住保存并给出 aria-invalid 与可见提示", async () => {
    let patches = 0
    server.use(
      http.patch("/api/profile/basics", () => {
        patches += 1
        return HttpResponse.json(PROFILE)
      }),
    )

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))
    const email = screen.getByLabelText("邮箱")
    fireEvent.change(email, { target: { value: "ZZ-TEST-not-an-email" } })

    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("邮箱格式不正确。")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存基本信息" })).toBeDisabled()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(patches).toBe(0)
  })

  it("合法邮箱可以正常保存", async () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))
    const email = screen.getByLabelText("邮箱")
    fireEvent.change(email, { target: { value: "new@resumate.dev" } })

    expect(email).not.toHaveAttribute("aria-invalid", "true")
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }))

    expect(await screen.findByText("new@resumate.dev")).toBeInTheDocument()
  })

  it("新增事实后端返回 422 时展示业务校验文案而不是静默", async () => {
    server.use(
      http.post("/api/profile/facts", () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "事实标题不能超过 200 个字符" }, { status: 422 }),
      ),
    )

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加技能专长" }))
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Rust 工程实践" } })
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "用 Rust 重写数据管道。" } })
    fireEvent.click(screen.getByRole("button", { name: "添加事实" }))

    expect(await screen.findByText("事实标题不能超过 200 个字符")).toBeInTheDocument()
  })
})

describe("ProfileWorkspace 输入上限与展示断行", () => {
  it("事实标题输入限制为 200 字符", () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "手动添加技能专长" }))
    expect(screen.getByLabelText("标题")).toHaveAttribute("maxlength", "200")
  })

  it("主档输入都有长度上限", () => {
    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))
    for (const label of ["姓名", "一句话头衔", "邮箱", "电话", "城市"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("maxlength")
    }
  })

  it("超过 200 字符的既有事实标题提交被本地拦下并提示", () => {
    const longTitle = "W".repeat(201)
    const onSave = vi.fn(() => Promise.resolve())

    render(
      <ProfileFactForm
        mode="update"
        fact={{ ...PROFILE.facts[0], title: longTitle }}
        onSave={onSave}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))
    expect(screen.getByText("标题不能超过 200 个字符。")).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("同一 tick 连续两次点击只提交一次事实", () => {
    const onSave = vi.fn(() => new Promise<void>(() => {}))

    render(<ProfileFactForm mode="create" defaultType="skill" onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Rust 工程实践" } })
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "用 Rust 重写数据管道。" } })

    const submit = screen.getByRole("button", { name: "添加事实" })
    // 同一 tick 内两次同步 click：React 尚未提交 disabled，必须靠同步 ref 守卫。
    act(() => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("超长无空格头衔在展示侧断行，不横向撑破卡片", async () => {
    const longHeadline = "W".repeat(240)

    renderProfile()
    fireEvent.click(screen.getByRole("button", { name: "编辑基本信息" }))
    fireEvent.change(screen.getByLabelText("一句话头衔"), { target: { value: longHeadline } })
    fireEvent.click(screen.getByRole("button", { name: "保存基本信息" }))

    const shown = await screen.findByText(longHeadline)
    expect(shown).toHaveClass("wrap-anywhere")
  })

  it("超长无空格事实内容在展示侧断行，卡片不横向溢出", () => {
    const longContent = "X".repeat(5000)
    renderProfile({ ...PROFILE, facts: [{ ...PROFILE.facts[0], content: longContent }] })

    const shown = screen.getByText(longContent)
    expect(shown).toHaveClass("wrap-anywhere")
    expect(shown.closest("li")).toHaveClass("overflow-hidden")
  })
})

describe("事实类型顺序单一来源", () => {
  it("分区顺序与 FACT_TYPE_ORDER 一致，下拉不再与分区漂移", () => {
    renderProfile()
    const labels = Array.from(document.querySelectorAll("section[aria-label]")).map((node) => node.getAttribute("aria-label"))
    const expected = FACT_TYPE_ORDER.map((type) => i18n.t("profile.sections." + type + ".title"))

    expect(labels.slice(1)).toEqual(expected)
  })
})
