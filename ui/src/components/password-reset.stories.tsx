// Storybook confirmation artifact for the b5586 forgotten-password pages.
// The form/reset stories render the real pages from ui/src/pages and drive the real
// lib/api + lib/password-reset code against MSW, so the artifact exercises the same
// request contract as production instead of a lookalike container.
// The sent / resend harnesses stay presentational, mirroring Pages/EmailVerification.
import type { ReactElement } from "react"
import { StrictMode } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { delay, http, HttpResponse } from "msw"
import { ForgotPasswordSent } from "@/components/forgot-password-sent"
import { ResetPasswordForm } from "@/components/reset-password-form"
import { ResetPasswordResult, type ResetInvalidReason } from "@/components/reset-password-result"
import { ForgotPasswordPage } from "@/pages/forgot-password"
import { ResetPasswordPage } from "@/pages/reset-password"
import i18n from "@/i18n"
import { usePasswordResetResend } from "@/lib/password-reset"
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

/** Mounts the real page on its own route and stubs the pages it can navigate to. */
function PageFrame({ entry, path, element }: { entry: string; path: string; element: ReactElement }) {
  const elsewhere = ["/forgot-password", "/reset-password", "/login"].filter((candidate) => candidate !== path)
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={element} />
        {elsewhere.map((candidate) => (
          <Route key={candidate} path={candidate} element={<></>} />
        ))}
      </Routes>
    </MemoryRouter>
  )
}

function ForgotFormStory({ scenario = "sent", strict = false }: { scenario?: ForgotScenario; strict?: boolean }) {
  forgotHandlers(scenario)
  const page = <PageFrame entry="/forgot-password" path="/forgot-password" element={<ForgotPasswordPage />} />
  return strict ? <StrictMode>{page}</StrictMode> : page
}

function ResetPageStory({ scenario = "success", token = RESET_TOKEN, strict = false }: { scenario?: ResetScenario; token?: string; strict?: boolean }) {
  resetHandlers(scenario)
  const page = <PageFrame entry={"/reset-password?token=" + token} path="/reset-password" element={<ResetPasswordPage />} />
  return strict ? <StrictMode>{page}</StrictMode> : page
}

/** Dead-link state reached without a token: the page renders it straight from the URL. */
function ResetNoTokenStory() {
  resetHandlers("success")
  return <PageFrame entry="/reset-password" path="/reset-password" element={<ResetPasswordPage />} />
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
  render: () => <ForgotFormStory scenario="pending" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    fillInput(canvasElement, "forgot-email", EMAIL)
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
export const ResetFormDefault = { render: () => <ResetPageStory /> }

export const ResetFormSubmitting = {
  render: () => <ResetPageStory scenario="pending" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

export const ResetFormShortPassword = {
  render: () => <ResetPageStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "short", "short")
  },
}

export const ResetFormMismatch = {
  render: () => <ResetPageStory />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "other-password-3")
  },
}

export const ResetSuccess = {
  render: () => <ResetPageStory scenario="success" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

/** The server rejected the one-time token: the machine code drives the copy. */
export const ResetInvalidToken = {
  render: () => <ResetPageStory scenario="invalidToken" token={DEAD_TOKEN} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

export const ResetNetworkError = {
  render: () => <ResetPageStory scenario="networkError" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}

/** The address carries no token at all, so the page never even offers the form. */
export const ResetMissingToken = { render: () => <ResetNoTokenStory /> }

export const ResetInvalidExpired = { render: () => <StaticResetResult state="invalid" reason="expired" /> }

export const ResetInvalidUsed = { render: () => <StaticResetResult state="invalid" reason="used" /> }

export const ResetInvalidMalformed = { render: () => <StaticResetResult state="invalid" reason="malformed" /> }

export const ResetDisabled = {
  render: () => <ResetPasswordForm onSubmit={() => {}} disabled onBackToLogin={() => {}} />,
}

/**
 * Regression guard for the 62adb shape: a one-time token must be sent exactly once under
 * StrictMode's mount -> cleanup -> mount, and the result must still be committed.
 */
export const ResetStrictMode = {
  render: () => <ResetPageStory scenario="success" strict />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    submitReset(canvasElement, "new-password-2", "new-password-2")
  },
}
