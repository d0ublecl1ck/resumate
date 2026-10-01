// Storybook confirmation artifact for the agent onboarding guide (issue 2792f).
// Three availability states at their intended placements: the profile assistant
// drawer body and the settings page agent section entry. The blocked states are
// derived from GET /models/config through MSW; since e122a the real pages combine it
// with GET /agent/runtime, while this story still renders the "available" state
// explicitly for visual review. No page is wired here.

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

/** Reset runtime overrides, then serve the requested credential state. */
function applyModelConfig(keyConfigured: boolean) {
  worker.resetHandlers()
  if (!keyConfigured) {
    worker.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))
  }
}

/** Derive the blocked state from the real model-config contract. */
function ModelAvailabilityGate({ children }: { children: (state: AgentAvailability) => ReactNode }) {
  const { data, isPending } = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig })
  if (isPending || !data) return null
  return <>{children(agentAvailabilityFromModelConfig(data))}</>
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
  return state ? (
    <AgentAvailabilityNotice state={state} />
  ) : (
    <ModelAvailabilityGate>{(derived) => <AgentAvailabilityNotice state={derived} />}</ModelAvailabilityGate>
  )
}

function drawerStory(options: { keyConfigured: boolean; state?: AgentAvailability }) {
  applyModelConfig(options.keyConfigured)
  return (
    <StoryProviders key={JSON.stringify(options)}>
      <AssistantDrawer>{notice(options.state ?? null)}</AssistantDrawer>
    </StoryProviders>
  )
}

function entryStory(options: { keyConfigured: boolean; state?: AgentAvailability }) {
  applyModelConfig(options.keyConfigured)
  return (
    <StoryProviders key={JSON.stringify(options)}>
      <SettingsSection>{notice(options.state ?? null)}</SettingsSection>
    </StoryProviders>
  )
}

export default {
  title: "Components/AgentOnboarding",
  parameters: { layout: "fullscreen" },
}

/** Placement: profile assistant drawer body. Credential missing (keyConfigured=false). */
export const ProfileAssistantModelMissing = { render: () => drawerStory({ keyConfigured: false }) }

/** Placement: profile assistant drawer body. Current real state: runtime not connected. */
export const ProfileAssistantRuntimeOffline = { render: () => drawerStory({ keyConfigured: true }) }

/** Placement: profile assistant drawer body. Future available state, placeholder only. */
export const ProfileAssistantAvailable = { render: () => drawerStory({ keyConfigured: true, state: "available" }) }

/** Placement: settings agent section entry. Credential missing (keyConfigured=false). */
export const SettingsEntryModelMissing = { render: () => entryStory({ keyConfigured: false }) }

/** Placement: settings agent section entry. Current real state: runtime not connected. */
export const SettingsEntryRuntimeOffline = { render: () => entryStory({ keyConfigured: true }) }

/** All three availability states side by side for visual review. */
export const StatesGallery = {
  render: () => (
    <div className="grid gap-4 p-6 lg:grid-cols-3">
      <AgentAvailabilityNotice state="model_missing" placement="entry" />
      <AgentAvailabilityNotice state="runtime_offline" placement="entry" />
      <AgentAvailabilityNotice state="available" placement="entry" />
    </div>
  ),
}
