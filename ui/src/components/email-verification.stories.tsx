// Storybook confirmation artifact for the d7b99 email-verification front-end states.
// Every state is driven by MSW: the shared handlers describe the frozen contract, and each
// interaction story registers a scenario override (or a pending response) before it renders.
// Components stay presentational; the wiring to lib/api.ts happens in the follow-up step.
import { useEffect, useState } from "react"
import { delay, http, HttpResponse } from "msw"
import { useTranslation } from "react-i18next"
import { LoginForm } from "@/components/login-form"
import { RegisterVerification, type ResendState, type ResendStatus } from "@/components/register-verification"
import { VerifyEmailResult, type VerifyInvalidReason, type VerifyState } from "@/components/verify-email-result"
import i18n from "@/i18n"
import type { AuthUser } from "@/lib/types"
import { worker } from "@/mocks/browser"

const EMAIL = "zhang@example.com"
// Boundary value: 64-char local part plus a long domain must wrap inside the card.
const LONG_EMAIL =
  "very.long.local.part.used.for.the.boundary.check+resumate@subdomain.example-enterprise-mail.test"

const AUTH_USER: AuthUser = {
  id: "user_email_verify",
  email: EMAIL,
  displayName: "Zhang Mu",
  role: "user",
  roles: ["user"],
  permissions: ["account:read"],
  isBanned: false,
  createdAt: "2026-01-01T00:00:00+08:00",
}

const RESEND_PATH = "/api/auth/verification/resend"
const VERIFY_PATH = "/api/auth/verification/verify"
const VERIFY_TOKEN = "valid-token"

type ResendScenario = "sent" | "pending" | "tooSoon" | "rateLimited" | "networkError"
type VerifyScenario = "checking" | "success" | "invalid"

function errorKeyForCode(code?: string): string {
  switch (code) {
    case "EMAIL_NOT_VERIFIED":
      return "auth.errors.emailNotVerified"
    case "VERIFICATION_TOKEN_INVALID":
      return "auth.errors.verificationTokenInvalid"
    case "RESEND_TOO_SOON":
      return "auth.errors.resendTooSoon"
    case "RATE_LIMITED":
      return "auth.errors.rateLimited"
    default:
      return "auth.errors.generic"
  }
}

function applyResendOverride(scenario: ResendScenario) {
  if (scenario === "pending") {
    worker.use(
      http.post(RESEND_PATH, async () => {
        await delay("infinite")
        return HttpResponse.json({ status: "verification_sent" }, { status: 202 })
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
        return HttpResponse.json(AUTH_USER)
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

function useResendFlow() {
  const [status, setStatus] = useState<ResendStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function resend(email: string) {
    setStatus("sending")
    setErrorMessage(undefined)
    try {
      const response = await fetch(RESEND_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (response.ok) {
        setCooldown(60)
        setStatus("cooldown")
        return
      }
      const body = (await response.json().catch(() => null)) as { code?: string } | null
      setErrorMessage(i18n.t(errorKeyForCode(body?.code)))
      setStatus("error")
    } catch {
      setErrorMessage(i18n.t("auth.errors.network"))
      setStatus("error")
    }
  }

  const resendView: ResendState = { status: cooldown > 0 ? "cooldown" : status, cooldownSeconds: cooldown || undefined, errorMessage }
  return { resendView, resend }
}

function RegisterStory({ scenario, email = EMAIL, disabled = false }: { scenario: ResendScenario; email?: string; disabled?: boolean }) {
  resendHandlers(scenario)
  // Shared 202 handler covers the plain resend success path.
  const { resendView, resend } = useResendFlow()
  return (
    <RegisterVerification
      email={email}
      resend={resendView}
      disabled={disabled}
      onResend={() => void resend(email)}
      onChangeEmail={() => {}}
      onBackToLogin={() => {}}
    />
  )
}

function VerifyStory({
  scenario,
  token,
  email = EMAIL,
  resendScenario = "sent",
}: {
  scenario: VerifyScenario
  token: string
  email?: string
  resendScenario?: ResendScenario
}) {
  verifyHandlers(scenario, resendScenario)
  const { resendView, resend } = useResendFlow()
  const [state, setState] = useState<VerifyState>("verifying")
  const [reason, setReason] = useState<VerifyInvalidReason | undefined>(undefined)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch(VERIFY_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        if (!active) return
        if (response.ok) {
          setState("success")
          return
        }
        const body = (await response.json().catch(() => null)) as { code?: string } | null
        setReason(body?.code === "VERIFICATION_TOKEN_INVALID" ? "malformed" : undefined)
        setState("invalid")
      } catch {
        if (!active) return
        setReason("malformed")
        setState("invalid")
      }
    })()
    return () => {
      active = false
    }
  }, [token])

  return (
    <VerifyEmailResult
      state={state}
      reason={reason}
      email={email}
      resend={resendView}
      onResend={(value) => void resend(value)}
      onGoToWorkbench={() => {}}
      onBackToSignIn={() => {}}
    />
  )
}

function StaticVerify({ state, reason, email = EMAIL, disabled = false }: { state: VerifyState; reason?: VerifyInvalidReason; email?: string; disabled?: boolean }) {
  return (
    <VerifyEmailResult
      state={state}
      reason={reason}
      email={email}
      disabled={disabled}
      resend={{ status: "idle" }}
      onResend={() => {}}
      onGoToWorkbench={() => {}}
      onBackToSignIn={() => {}}
    />
  )
}

function LoginUnverifiedStory() {
  const { t } = useTranslation()
  return <LoginForm mode="login" onModeChange={() => {}} onSubmit={() => {}} error={t("auth.errors.emailNotVerified")} />
}

function clickButton(canvasElement: HTMLElement, label: string) {
  const button = Array.from(canvasElement.querySelectorAll("button")).find((item) => item.textContent?.includes(label))
  button?.click()
}

/** The invalid-link actions only mount after the verify request settles, so wait for them. */
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

export const RegisterLongEmail = { render: () => <RegisterStory scenario="sent" email={LONG_EMAIL} /> }

export const RegisterDisabled = { render: () => <RegisterStory scenario="sent" disabled /> }

// SCR-000 /verify-email: token consumed by the verify endpoint.
export const VerifyChecking = { render: () => <VerifyStory scenario="checking" token={VERIFY_TOKEN} /> }

export const VerifySuccess = { render: () => <VerifyStory scenario="success" token={VERIFY_TOKEN} /> }

export const VerifyInvalidToken = { render: () => <VerifyStory scenario="invalid" token="expired-token" /> }

export const VerifyLinkExpired = { render: () => <StaticVerify state="invalid" reason="expired" /> }

export const VerifyLinkUsed = { render: () => <StaticVerify state="invalid" reason="used" /> }

export const VerifyResendCooldown = {
  render: () => <VerifyStory scenario="invalid" token="expired-token" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await clickButtonWhenReady(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const VerifyResendRateLimited = {
  render: () => <VerifyStory scenario="invalid" token="expired-token" resendScenario="rateLimited" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await clickButtonWhenReady(canvasElement, i18n.t("auth.verification.resend"))
  },
}

export const VerifyLongEmail = { render: () => <StaticVerify state="invalid" reason="expired" email={LONG_EMAIL} /> }

export const VerifyDisabled = { render: () => <StaticVerify state="invalid" reason="expired" disabled /> }

// SCR-000 sign-in: the account exists but the email is still unverified.
export const LoginUnverified = { render: () => <LoginUnverifiedStory /> }
