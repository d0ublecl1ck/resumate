// Storybook confirmation artifact for the d7b99 email-verification front-end states.
// Stories now drive the real lib/api + lib/verification code against MSW, so the artifact
// exercises the same request contract as the pages; no demo-only data branch remains.
import { useEffect, useState } from "react"
import { delay, http, HttpResponse } from "msw"
import { useTranslation } from "react-i18next"
import { LoginForm } from "@/components/login-form"
import { LoginVerificationNotice } from "@/components/login-verification-notice"
import { RegisterVerification } from "@/components/register-verification"
import { VerifyEmailResult, type VerifyInvalidReason, type VerifyState } from "@/components/verify-email-result"
import i18n from "@/i18n"
import { verifyEmail } from "@/lib/api"
import { useVerificationResend } from "@/lib/verification"
import { worker } from "@/mocks/browser"

const EMAIL = "zhang@example.com"
// Boundary value: long local part plus a long domain must wrap inside the card.
const LONG_EMAIL =
  "very.long.local.part.used.for.the.boundary.check+resumate@subdomain.example-enterprise-mail.test"

const RESEND_PATH = "/api/auth/verification/resend"
const VERIFY_PATH = "/api/auth/verification/verify"
const VERIFY_TOKEN = "valid-token"
const DEAD_TOKEN = "expired-token"
const UNVERIFIED_EMAIL = "unverified@resumate.dev"

type ResendScenario = "sent" | "pending" | "tooSoon" | "rateLimited" | "networkError" | "alreadyVerified"
type VerifyScenario = "checking" | "success" | "invalid"

function applyResendOverride(scenario: ResendScenario) {
  if (scenario === "pending") {
    worker.use(
      http.post(RESEND_PATH, async () => {
        await delay("infinite")
        return HttpResponse.json({ status: "verification_sent", email: EMAIL }, { status: 202 })
      }),
    )
  }
  if (scenario === "tooSoon") {
    worker.use(http.post(RESEND_PATH, () => HttpResponse.json({ code: "RESEND_TOO_SOON", message: "resend too soon" }, { status: 429 })))
  }
  if (scenario === "rateLimited") {
    worker.use(http.post(RESEND_PATH, () => HttpResponse.json({ code: "RATE_LIMITED", message: "rate limited" }, { status: 429 })))
  }
  if (scenario === "networkError") {
    worker.use(http.post(RESEND_PATH, () => HttpResponse.error()))
  }
  if (scenario === "alreadyVerified") {
    worker.use(http.post(RESEND_PATH, () => HttpResponse.json({ status: "already_verified", email: EMAIL }, { status: 202 })))
  }
}

function resendHandlers(scenario: ResendScenario) {
  worker.resetHandlers()
  applyResendOverride(scenario)
}

function verifyHandlers(scenario: VerifyScenario, resendScenario: ResendScenario) {
  worker.resetHandlers()
  if (scenario === "checking") {
    worker.use(
      http.post(VERIFY_PATH, async () => {
        await delay("infinite")
        return HttpResponse.json({ status: "pending" })
      }),
    )
  }
  if (scenario === "invalid") {
    worker.use(
      http.post(VERIFY_PATH, () => HttpResponse.json({ code: "VERIFICATION_TOKEN_INVALID", message: "invalid token" }, { status: 400 })),
    )
  }
  applyResendOverride(resendScenario)
}

function RegisterStory({ scenario, email = EMAIL, disabled = false }: { scenario: ResendScenario; email?: string; disabled?: boolean }) {
  resendHandlers(scenario)
  const { resend, resendState } = useVerificationResend()
  return (
    <RegisterVerification
      email={email}
      resend={resendState}
      disabled={disabled}
      onResend={() => void resend({ email })}
      onChangeEmail={() => {}}
      onBackToLogin={() => {}}
    />
  )
}

function VerifyStory({
  scenario,
  token,
  resendScenario = "sent",
}: {
  scenario: VerifyScenario
  token: string
  resendScenario?: ResendScenario
}) {
  verifyHandlers(scenario, resendScenario)
  const { resend, resendState } = useVerificationResend()
  const [state, setState] = useState<VerifyState>("verifying")
  const [reason, setReason] = useState<VerifyInvalidReason | undefined>(undefined)

  useEffect(() => {
    let active = true
    verifyEmail(token)
      .then(() => {
        if (active) setState("success")
      })
      .catch(() => {
        if (!active) return
        setReason("expired")
        setState("invalid")
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <VerifyEmailResult
      state={state}
      reason={reason}
      resend={resendState}
      onResend={() => void resend({ token })}
      onGoToWorkbench={() => {}}
      onBackToSignIn={() => {}}
    />
  )
}

function StaticVerify({
  state,
  reason,
  disabled = false,
  resendAvailable = true,
}: {
  state: VerifyState
  reason?: VerifyInvalidReason
  disabled?: boolean
  resendAvailable?: boolean
}) {
  return (
    <VerifyEmailResult
      state={state}
      reason={reason}
      disabled={disabled}
      resendAvailable={resendAvailable}
      resend={{ status: "idle" }}
      onResend={() => {}}
      onGoToWorkbench={() => {}}
      onBackToSignIn={() => {}}
    />
  )
}

function LoginStory({ scenario }: { scenario: ResendScenario }) {
  resendHandlers(scenario)
  const { t } = useTranslation()
  const { resend, resendState } = useVerificationResend()
  return (
    <LoginForm
      mode="login"
      onModeChange={() => {}}
      onSubmit={() => {}}
      initialEmail={UNVERIFIED_EMAIL}
      error={t("auth.errors.emailNotVerified")}
      notice={<LoginVerificationNotice resend={resendState} onResend={() => void resend({ email: UNVERIFIED_EMAIL })} />}
    />
  )
}

function clickButton(canvasElement: HTMLElement, label: string) {
  const button = Array.from(canvasElement.querySelectorAll("button")).find((item) => item.textContent?.includes(label))
  button?.click()
}

/** The dead-link actions only mount after the verify request settles, so wait for them. */
async function clickButtonWhenReady(canvasElement: HTMLElement, label: string, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const button = Array.from(canvasElement.querySelectorAll("button")).find((item) => item.textContent?.includes(label))
    if (button && !button.disabled) {
      button.click()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

export default {
  title: "Pages/EmailVerification",
  parameters: { layout: "fullscreen" },
}

// SCR-000 registration: the account exists but the mailbox is not verified yet.
export const RegisterSent = { render: () => <RegisterStory scenario="sent" /> }

export const RegisterResendPending = {
  render: () => <RegisterStory scenario="pending" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterResendCooldown = {
  render: () => <RegisterStory scenario="sent" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterResendTooSoon = {
  render: () => <RegisterStory scenario="tooSoon" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterRateLimited = {
  render: () => <RegisterStory scenario="rateLimited" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterNetworkError = {
  render: () => <RegisterStory scenario="networkError" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterAlreadyVerified = {
  render: () => <RegisterStory scenario="alreadyVerified" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterLongEmail = { render: () => <RegisterStory scenario="sent" email={LONG_EMAIL} /> }

/** Resend succeeds for a long address: the confirmation line must wrap inside the card. */
export const RegisterResendLongEmail = {
  render: () => <RegisterStory scenario="sent" email={LONG_EMAIL} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const RegisterDisabled = { render: () => <RegisterStory scenario="sent" disabled /> }

// SCR-000 /verify-email: the token is consumed by the verify endpoint.
export const VerifyChecking = { render: () => <VerifyStory scenario="checking" token={VERIFY_TOKEN} /> }

export const VerifySuccess = { render: () => <VerifyStory scenario="success" token={VERIFY_TOKEN} /> }

export const VerifyInvalidToken = { render: () => <VerifyStory scenario="invalid" token={DEAD_TOKEN} /> }

export const VerifyLinkExpired = { render: () => <StaticVerify state="invalid" reason="expired" /> }

export const VerifyLinkUsed = { render: () => <StaticVerify state="invalid" reason="used" /> }

/** The address has no usable token, so resending by token is not offered. */
export const VerifyMalformedLink = { render: () => <StaticVerify state="invalid" reason="malformed" resendAvailable={false} /> }

export const VerifyResendCooldown = {
  render: () => <VerifyStory scenario="invalid" token={DEAD_TOKEN} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await clickButtonWhenReady(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const VerifyResendRateLimited = {
  render: () => <VerifyStory scenario="invalid" token={DEAD_TOKEN} resendScenario="rateLimited" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await clickButtonWhenReady(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const VerifyAlreadyVerified = {
  render: () => <VerifyStory scenario="invalid" token={DEAD_TOKEN} resendScenario="alreadyVerified" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await clickButtonWhenReady(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const VerifyDisabled = { render: () => <StaticVerify state="invalid" reason="expired" disabled /> }

// SCR-000 sign-in: the account exists but the email is still unverified.
export const LoginUnverified = { render: () => <LoginStory scenario="sent" /> }

export const LoginUnverifiedResent = {
  render: () => <LoginStory scenario="sent" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const LoginUnverifiedRateLimited = {
  render: () => <LoginStory scenario="rateLimited" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const LoginAlreadyVerified = {
  render: () => <LoginStory scenario="alreadyVerified" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    clickButton(canvasElement, i18n.t("auth.verification.resend"))
  },
}
