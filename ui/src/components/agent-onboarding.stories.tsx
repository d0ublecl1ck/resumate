// Storybook confirmation artifact for the agent onboarding guide (issue 05fa6).
// Surface x state matrix: the profile assistant drawer, the resume editor chat pane and
// the settings agent section entry, each at model_missing / auth_failed / runtime_offline /
// available. The blocked states are derived from GET /models/config through MSW so the
// story exercises the real contract (including credential rejection); the "available"
// state is rendered explicitly for visual review. No page is wired here.

import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { http, HttpResponse } from "msw"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { AgentAvailabilityNotice, agentAvailabilityFromModelConfig, type AgentAvailability } from "@/components/agent-onboarding"
import { StoryProviders } from "@/storybook/screen"
import { getModelConfig } from "@/lib/api"
import { MODEL_CONFIG } from "@/lib/content"
import { worker } from "@/mocks/browser"

/** 模型配置 mock 场景：没配 key / 配了但被上游拒绝 / 正常配置。 */
type ModelScenario = "configured" | "missing" | "rejected"

/** Reset runtime overrides, then serve the requested credential state. */
function applyModelConfig(scenario: ModelScenario) {
  worker.resetHandlers()
  if (scenario === "missing") {
    worker.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
  }
  if (scenario === "rejected") {
    worker.use(
      http.get("/api/models/config", () =>
        HttpResponse.json({
          ...MODEL_CONFIG,
          keyConfigured: true,
          lastTest: { at: "2026-10-10T09:15:00+08:00", ok: false, message: "Error code: 401 - api key ****be21 is invalid" },
        }),
      ),
    )
  }
}

/** Derive the blocked state from the real model-config contract, including the rejected credential tail. */
function ModelAvailabilityNotice() {
  const { data, isPending } = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig })
  if (isPending || !data) return null
  return <AgentAvailabilityNotice state={agentAvailabilityFromModelConfig(data)} credentialHint={data.lastTest?.message} />
}

/** Placement mock: profile assistant drawer body (ui/src/components/profile-assistant.tsx). */
function AssistantDrawer({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[600px] justify-end bg-foreground/10 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-foreground/15 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("profile.assistant.title")}</p>
            <p className="text-xs text-muted-foreground">{t("profile.assistant.description")}</p>
          </div>
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
            <X className="size-5" />
          </span>
        </div>
        <div className="flex-1 p-4">{children}</div>
      </div>
    </div>
  )
}

/** Placement mock: resume editor chat pane (ui/src/components/resume-chat-panel.tsx). */
function ResumeChatPane({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-md p-4">
      <section className="card-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("resume.editor.chatAndRun")}</h2>
        <div role="tablist" aria-label={t("sessionHistory.title")} className="mb-3 flex gap-1">
          <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            {t("sessionHistory.currentChat")}
          </span>
          <span className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground">{t("sessionHistory.title")}</span>
        </div>
        <div role="tabpanel">{children}</div>
      </section>
    </div>
  )
}

/** Placement mock: settings page agent section entry (ui/src/components/settings-form.tsx). */
function SettingsSection({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl p-6">
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("settings.agent.title")}</h2>
        <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">{t("settings.agent.hint")}</p>
        {children}
      </section>
    </div>
  )
}

function notice(state: AgentAvailability | null) {
  return state ? <AgentAvailabilityNotice state={state} /> : <ModelAvailabilityNotice />
}

function surfaceStory(Surface: (props: { children: ReactNode }) => ReactNode, options: { scenario: ModelScenario; state?: AgentAvailability }) {
  applyModelConfig(options.scenario)
  return (
    <StoryProviders key={JSON.stringify(options)}>
      <Surface>{notice(options.state ?? null)}</Surface>
    </StoryProviders>
  )
}

const drawerStory = (options: { scenario: ModelScenario; state?: AgentAvailability }) => surfaceStory(AssistantDrawer, options)
const chatStory = (options: { scenario: ModelScenario; state?: AgentAvailability }) => surfaceStory(ResumeChatPane, options)
const entryStory = (options: { scenario: ModelScenario; state?: AgentAvailability }) => surfaceStory(SettingsSection, options)

export default {
  title: "Components/AgentOnboarding",
  parameters: { layout: "fullscreen" },
}

/** Placement: profile assistant drawer body. Credential missing (keyConfigured=false). */
export const ProfileAssistantModelMissing = { render: () => drawerStory({ scenario: "missing" }) }

/** Placement: profile assistant drawer body. Key configured but rejected upstream (401). */
export const ProfileAssistantAuthFailed = { render: () => drawerStory({ scenario: "rejected" }) }

/** Placement: profile assistant drawer body. Current real state: runtime not connected. */
export const ProfileAssistantRuntimeOffline = { render: () => drawerStory({ scenario: "configured" }) }

/** Placement: profile assistant drawer body. Future available state, placeholder only. */
export const ProfileAssistantAvailable = { render: () => drawerStory({ scenario: "configured", state: "available" }) }

/** Placement: resume editor chat pane. Credential missing (keyConfigured=false). */
export const ResumeChatModelMissing = { render: () => chatStory({ scenario: "missing" }) }

/** Placement: resume editor chat pane. Key configured but rejected upstream (401). */
export const ResumeChatAuthFailed = { render: () => chatStory({ scenario: "rejected" }) }

/** Placement: resume editor chat pane. Configured but the runtime is not connected. */
export const ResumeChatRuntimeOffline = { render: () => chatStory({ scenario: "configured" }) }

/** Placement: resume editor chat pane. Future available state, placeholder only. */
export const ResumeChatAvailable = { render: () => chatStory({ scenario: "configured", state: "available" }) }

/** Placement: settings agent section entry. Credential missing (keyConfigured=false). */
export const SettingsEntryModelMissing = { render: () => entryStory({ scenario: "missing" }) }

/** Placement: settings agent section entry. Key configured but rejected upstream (401). */
export const SettingsEntryAuthFailed = { render: () => entryStory({ scenario: "rejected" }) }

/** Placement: settings agent section entry. Current real state: runtime not connected. */
export const SettingsEntryRuntimeOffline = { render: () => entryStory({ scenario: "configured" }) }

/** Placement: settings agent section entry. Future available state, placeholder only. */
export const SettingsEntryAvailable = { render: () => entryStory({ scenario: "configured", state: "available" }) }

/** All four availability states side by side for visual review. */
export const StatesGallery = {
  render: () => (
    <div className="grid gap-4 p-6 lg:grid-cols-4">
      <AgentAvailabilityNotice state="model_missing" placement="entry" />
      <AgentAvailabilityNotice state="auth_failed" placement="entry" credentialHint="401 api key ****be21 is invalid" />
      <AgentAvailabilityNotice state="runtime_offline" placement="entry" />
      <AgentAvailabilityNotice state="available" placement="entry" />
    </div>
  ),
}
