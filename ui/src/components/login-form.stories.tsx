import { LoginForm } from "./login-form"

export default {
  title: "Pages/Login",
  component: LoginForm,
  parameters: { layout: "fullscreen" },
  args: {
    mode: "login",
    onModeChange: () => {},
    onSubmit: () => {},
    submitting: false,
    error: null,
  },
}

export const Login = {}

export const Register = { args: { mode: "register" } }

export const Submitting = { args: { submitting: true } }

export const InvalidCredentials = { args: { error: "邮箱或密码不正确。" } }

export const AccountBanned = { args: { error: "账号已被封禁，请联系管理员。" } }
