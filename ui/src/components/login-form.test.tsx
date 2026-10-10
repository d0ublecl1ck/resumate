import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LoginForm } from "./login-form"

afterEach(cleanup)

describe("LoginForm", () => {
  it("提交登录凭据并 trim 邮箱", async () => {
    const onSubmit = vi.fn()
    render(<LoginForm mode="login" onModeChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: " test@resumate.dev " } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ email: "test@resumate.dev", password: "password123" }))
  })

  it("注册模式带昵称提交", async () => {
    const onSubmit = vi.fn()
    render(<LoginForm mode="register" onModeChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "示例同学" } })
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "a@b.com" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "注册" }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com", password: "password123", displayName: "示例同学" }),
    )
  })

  it("展示错误文案并在提交中禁用", () => {
    render(<LoginForm mode="login" onModeChange={() => {}} onSubmit={() => {}} submitting error="邮箱或密码不正确。" />)

    expect(screen.getByRole("alert")).toHaveTextContent("邮箱或密码不正确。")
    expect(screen.getByRole("button", { name: /处理中/ })).toBeDisabled()
  })

  it("错误下方的内联 notice 与错误文案同时展示", () => {
    render(
      <LoginForm
        mode="login"
        onModeChange={() => {}}
        onSubmit={() => {}}
        error="邮箱还未验证，请先完成邮箱验证。"
        notice={<button type="button">重新发送验证邮件</button>}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("邮箱还未验证，请先完成邮箱验证。")
    expect(screen.getByRole("button", { name: "重新发送验证邮件" })).toBeInTheDocument()
  })

  it("邮箱缺少 @ 时展示中文校验提示且不提交", async () => {
    const onSubmit = vi.fn()
    render(<LoginForm mode="login" onModeChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "abc" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的邮箱地址。")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("可切换到注册模式", () => {
    const onModeChange = vi.fn()
    render(<LoginForm mode="login" onModeChange={onModeChange} onSubmit={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: "去注册" }))

    expect(onModeChange).toHaveBeenCalledWith("register")
  })
})
