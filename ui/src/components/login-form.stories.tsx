import { useTranslation } from "react-i18next"
import { LoginForm, type LoginMode } from "./login-form"

function LoginStory({ mode = "login", submitting = false, errorKey }: { mode?: LoginMode; submitting?: boolean; errorKey?: string }) {
  const { t } = useTranslation()
  return (
    <LoginForm
      mode={mode}
      onModeChange={() => {}}
      onSubmit={() => {}}
      submitting={submitting}
      error={errorKey ? t(errorKey) : null}
    />
  )
}

/** React 受控值在 play 里必须走原生 setter + input/change 事件才能生效。 */
function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

export default {
  title: "Pages/Login",
  component: LoginForm,
  parameters: { layout: "fullscreen" },
}

export const Login = { render: () => <LoginStory /> }

export const Register = { render: () => <LoginStory mode="register" /> }

export const Submitting = { render: () => <LoginStory submitting /> }

export const InvalidCredentials = { render: () => <LoginStory errorKey="auth.errors.invalidCredentials" /> }

export const AccountBanned = { render: () => <LoginStory errorKey="auth.errors.accountBanned" /> }

/** 服务端 VALIDATION_FAILED 的本地化兜底文案，不再直出后端英文 message。 */
export const ValidationFailed = { render: () => <LoginStory errorKey="auth.errors.invalidInput" /> }

/** 客户端 zod 校验：邮箱缺少 @ 时在提交前给出中文提示。 */
export const InvalidEmail = {
  render: () => <LoginStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const email = canvasElement.querySelector<HTMLInputElement>("#login-email")
    const password = canvasElement.querySelector<HTMLInputElement>("#login-password")
    const submit = canvasElement.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (!email || !password || !submit) return
    setValue(email, "abc")
    setValue(password, "password123")
    await new Promise((resolve) => setTimeout(resolve, 0))
    submit.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  },
}
