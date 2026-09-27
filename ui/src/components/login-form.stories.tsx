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
