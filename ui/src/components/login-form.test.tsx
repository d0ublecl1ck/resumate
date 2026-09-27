import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LoginForm } from "./login-form"

afterEach(cleanup)

describe("LoginForm", () => {
  it("提交登录凭据并 trim 邮箱", () => {
    const onSubmit = vi.fn()
    render(<LoginForm mode="login" onModeChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: " test@resumate.dev " } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(onSubmit).toHaveBeenCalledWith({ email: "test@resumate.dev", password: "password123" })
  })

  it("注册模式带昵称提交", () => {
    const onSubmit = vi.fn()
    render(<LoginForm mode="register" onModeChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "张沐" } })
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "a@b.com" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "注册并登录" }))

    expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com", password: "password123", displayName: "张沐" })
  })

  it("展示错误文案并在提交中禁用", () => {
    render(<LoginForm mode="login" onModeChange={() => {}} onSubmit={() => {}} submitting error="邮箱或密码不正确。" />)

    expect(screen.getByRole("alert")).toHaveTextContent("邮箱或密码不正确。")
    expect(screen.getByRole("button", { name: /处理中/ })).toBeDisabled()
  })

  it("可切换到注册模式", () => {
    const onModeChange = vi.fn()
    render(<LoginForm mode="login" onModeChange={onModeChange} onSubmit={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: "去注册" }))

    expect(onModeChange).toHaveBeenCalledWith("register")
  })
})
