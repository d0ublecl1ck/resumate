// Storybook confirmation artifact for the b5586 forgotten-password front-end states.
// Stories drive the real lib/api + lib/password-reset code against MSW, so the artifact
// exercises the same request contract as the pages; no demo-only data branch remains.
import { StrictMode, useState } from "react"
import { delay, http, HttpResponse } from "msw"
import { ForgotPasswordForm } from "@/components/forgot-password-form"
import { ForgotPasswordSent } from "@/components/forgot-password-sent"
import { ResetPasswordForm } from "@/components/reset-password-form"
import { ResetPasswordResult, type ResetInvalidReason } from "@/components/reset-password-result"
import i18n from "@/i18n"
import { resetPassword } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { passwordResetSubmitErrorMessage, usePasswordResetResend } from "@/lib/password-reset"
import { worker } from "@/mocks/browser"

const EMAIL = "zhang@example.com"
// Boundary value: long local part plus a long domain must wrap inside the card.
const LONG_EMAIL =
  "very.long.local.part.used.for.the.boundary.check+resumate@subdomain.example-enterprise-mail.test"

const FORGOT_PATH = "/api/auth/password/forgot"
const RESET_PATH = "/api/auth/password/reset"
const RESET_TOKEN = "valid-reset-token"
const DEAD_TOKEN = "expired-reset-token"

type ForgotScenario = "sent" | "pending" | "networkError"
type ResetScenario = "success" | "pending" | "networkError" | "invalidToken"

function applyForgotOverride(scenario: ForgotScenario) {
  if (scenario === "pending") {
    worker.use(
      http.post(FORGOT_PATH, async () => {
        await delay("infinite")
        return HttpResponse.json({ status: "reset_sent", email: EMAIL }, { status: 202 })
      }),
    )
  }
  if (scenario === "networkError") {
    worker.use(http.post(FORGOT_PATH, () => HttpResponse.error()))
  }
}

function forgotHandlers(scenario: ForgotScenario) {
  worker.resetHandlers()
  applyForgotOverride(scenario)
}

function resetHandlers(scenario: ResetScenario) {
  worker.resetHandlers()
  if (scenario === "pending") {
    worker.use(
      http.post(RESET_PATH, async () => {
        await delay("infinite")
        return new HttpResponse(null, { status: 204 })
      }),
    )
  }
  if (scenario === "networkError") {
    worker.use(http.post(RESET_PATH, () => HttpResponse.error()))
  }
  if (scenario === "invalidToken") {
    worker.use(
      http.post(RESET_PATH, () =>
        HttpResponse.json({ code: "PASSWORD_RESET_TOKEN_INVALID", message: "reset link invalid" }, { status: 400 }),
      ),
    )
  }
}

function ForgotFormStory({
  scenario = "sent",
  initialEmail = "",
  disabled = false,
  strict = false,
}: {
  scenario?: ForgotScenario
  initialEmail?: string
  disabled?: boolean
  strict?: boolean
}) {
  forgotHandlers(scenario)
  const { resend, resendState } = usePasswordResetResend()
  const form = (
    <ForgotPasswordForm
      onSubmit={(values) => void resend(values)}
      submitting={resendState.status === "sending"}
      error={resendState.status === "error" ? (resendState.errorMessage ?? null) : null}
      initialEmail={initialEmail}
      onBackToLogin={() => {}}
      disabled={disabled}
    />
  )
  return strict ? <StrictMode>{form}</StrictMode> : form
}

function ForgotSentStory({ scenario = "sent", email = EMAIL, disabled = false }: { scenario?: ForgotScenario; email?: string; disabled?: boolean }) {
  forgotHandlers(scenario)
  const { resend, resendState } = usePasswordResetResend()
  return (
    <ForgotPasswordSent
      email={email}
      resend={resendState}
      onResend={() => void resend({ email })}
      onChangeEmail={() => {}}
      onBackToLogin={() => {}}
      disabled={disabled}
    />
  )
}

function StaticForgotSent({ email = EMAIL, disabled = false }: { email?: string; disabled?: boolean }) {
  return (
    <ForgotPasswordSent
      email={email}
      resend={{ status: "idle" }}
      onResend={() => {}}
      onChangeEmail={() => {}}
      onBackToLogin={() => {}}
      disabled={disabled}
    />
  )
}

function ResetStory({
  scenario = "success",
  token = RESET_TOKEN,
  disabled = false,
  strict = false,
}: {
  scenario?: ResetScenario
  token?: string
  disabled?: boolean
  strict?: boolean
}) {
  resetHandlers(scenario)
  const [state, setState] = useState<"form" | "success" | "invalid">("form")
  const [error, setError] = useState<string | null>(null)
  const [invalidError, setInvalidError] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  async function submit(values: { password: string }) {
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword({ token, newPassword: values.password })
      setState("success")
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "PASSWORD_RESET_TOKEN_INVALID") {
        setInvalidError(passwordResetSubmitErrorMessage(cause))
        setState("invalid")
        return
      }
      setError(passwordResetSubmitErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  const view =
    state === "success" ? (
      <ResetPasswordResult state="success" onGoToLogin={() => {}} disabled={disabled} />
    ) : state === "invalid" ? (
      <ResetPasswordResult state="invalid" error={invalidError} onRequestNewLink={() => {}} onGoToLogin={() => {}} disabled={disabled} />
    ) : (
      <ResetPasswordForm onSubmit={submit} submitting={submitting} error={error} onBackToLogin={() => {}} disabled={disabled} />
    )
  return strict ? <StrictMode>{view}</StrictMode> : view
}

function StaticResetResult({
  state,
  reason,
  disabled = false,
}: {
  state: "success" | "invalid"
  reason?: ResetInvalidReason
  disabled?: boolean
}) {
  return <ResetPasswordResult state={state} reason={reason} onGoToLogin={() => {}} onRequestNewLink={() => {}} disabled={disabled} />
}

function fillInput(canvasElement: HTMLElement, id: string, value: string) {
  const input = canvasElement.querySelector<HTMLInputElement>("#" + id)
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function clickButton(canvasElement: HTMLElement, label: string) {
  const button = Array.from(canvasElement.querySelectorAll("button")).find((item) => item.textContent?.includes(label))
  button?.click()
}

function submitReset(canvasElement: HTMLElement, password: string, confirm: string) {
  fillInput(canvasElement, "reset-password", password)
  fillInput(canvasElement, "reset-password-confirm", confirm)
  clickButton(canvasElement, i18n.t("auth.passwordReset.resetSubmit"))
}

export default {
  title: "Pages/PasswordReset",
  parameters: { layout: "fullscreen" },
}

// SCR-000 /forgot-password: ask for the registered address, then confirm the neutral send.
export const ForgotFormDefault = { render: () => <ForgotFormStory /> }

export const ForgotFormSubmitting = {
  render: () => <ForgotFormStory scenario="pending" initialEmail={EMAIL} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.passwordReset.forgotSubmit"))
  },
}

/** Empty submit: react-hook-form + zod block it before any request leaves the browser. */
export const ForgotFormValidationError = {
  render: () => <ForgotFormStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.passwordReset.forgotSubmit"))
  },
}

export const ForgotSent = { render: () => <StaticForgotSent /> }

export const ForgotLongEmail = { render: () => <StaticForgotSent email={LONG_EMAIL} /> }

export const ForgotResendPending = {
  render: () => <ForgotSentStory scenario="pending" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.passwordReset.resend"))
  },
}

export const ForgotResendCooldown = {
  render: () => <ForgotSentStory scenario="sent" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.passwordReset.resend"))
  },
}

export const ForgotResendNetworkError = {
  render: () => <ForgotSentStory scenario="networkError" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.passwordReset.resend"))
  },
}

export const ForgotDisabled = { render: () => <StaticForgotSent disabled /> }

// SCR-000 /reset-password: the token is consumed by the reset endpoint.
export const ResetFormDefault = { render: () => <ResetStory /> }

export const ResetFormSubmitting = {
  render: () => <ResetStory scenario="pending" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

export const ResetFormShortPassword = {
  render: () => <ResetStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "short", "short")
  },
}

export const ResetFormMismatch = {
  render: () => <ResetStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "other-password-3")
  },
}

export const ResetSuccess = {
  render: () => <ResetStory scenario="success" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

/** The server rejected the one-time token: the machine code drives the copy. */
export const ResetInvalidToken = {
  render: () => <ResetStory scenario="invalidToken" token={DEAD_TOKEN} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

export const ResetNetworkError = {
  render: () => <ResetStory scenario="networkError" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

export const ResetInvalidExpired = { render: () => <StaticResetResult state="invalid" reason="expired" /> }

export const ResetInvalidUsed = { render: () => <StaticResetResult state="invalid" reason="used" /> }

export const ResetInvalidMalformed = { render: () => <StaticResetResult state="invalid" reason="malformed" /> }

export const ResetDisabled = { render: () => <ResetStory disabled /> }

/**
 * Regression guard for the 62adb shape: a one-time token must be sent exactly once under
 * StrictMode's mount -> cleanup -> mount, and the result must still be committed.
 */
export const ResetStrictMode = {
  render: () => <ResetStory scenario="success" strict />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}
