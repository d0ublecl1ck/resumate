// Storybook confirmation artifact for the SCR-010 model settings sections (f15af).
// Catalog and connection-test states are driven by MSW: the shared handlers stay untouched,
// and each story registers a scenario override before the form mounts.
import { delay, http, HttpResponse } from "msw"
import { SettingsForm } from "@/components/settings-form"
import i18n from "@/i18n"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import type { ModelConfig } from "@/lib/types"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"

type CatalogState = "ready" | "loading" | "error"

// Backend result copy for the connection test (not UI copy, so it stays untranslated).
const TEST_SUCCESS_MESSAGE = "Connection OK (HTTP 200)"
const TEST_FAILURE_MESSAGE = "Connection failed (HTTP 502)"

/** Reset runtime overrides, then register only what this catalog state needs. */
function applyCatalogHandlers(state: CatalogState) {
  worker.resetHandlers()
  if (state === "loading") {
    worker.use(
      http.get("/api/models/catalog", async () => {
        await delay("infinite")
        return HttpResponse.json({ source: "models.dev", providers: [] })
      }),
    )
  }
  if (state === "error") {
    worker.use(http.get("/api/models/catalog", () => HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message: "catalog unavailable" }, { status: 500 })))
  }
}

function CatalogStory({ scenario, model }: { scenario: string; model: ModelConfig }) {
  // Key on purpose: a new scenario must mount a fresh QueryClient instead of
  // reusing the previous story's cached API results and local state.
  return (
    <Screen key={scenario} path="/settings">
      <SettingsForm agent={AGENT_CONFIG} model={model} prefs={USER_PREFERENCES} templates={TEMPLATES} />
    </Screen>
  )
}

function catalogStory(state: CatalogState, model: ModelConfig = MODEL_CONFIG) {
  applyCatalogHandlers(state)
  return <CatalogStory scenario={state + ":" + model.provider + ":" + model.model} model={model} />
}


/** Seed the connection-test result through the saved config (no request needed). */
function testResultStory(ok: boolean, message: string) {
  applyCatalogHandlers("ready")
  return <CatalogStory scenario={"test:" + (ok ? "ok" : "fail")} model={{ ...MODEL_CONFIG, lastTest: { at: "2026-09-28T02:00:00+08:00", ok, message } }} />
}

/** Keep POST /models/config:test pending so the button stays in its testing state. */
function testPendingStory() {
  worker.resetHandlers()
  worker.use(
    http.post(/\/api\/models\/config:test$/, async () => {
      await delay("infinite")
      return HttpResponse.json({ at: "2026-09-28T02:00:00+08:00", ok: true, message: TEST_SUCCESS_MESSAGE })
    }),
  )
  return <CatalogStory scenario="test:pending" model={MODEL_CONFIG} />
}

export default {
  title: "Components/SettingsForm",
  component: SettingsForm,
  parameters: { layout: "fullscreen" },
}

/** Catalog loaded; saved provider and model both resolve to a catalog entry. */
export const Default = { render: () => catalogStory("ready") }

/** Catalog request is still in flight. */
export const CatalogLoading = { render: () => catalogStory("loading") }

/** Catalog request fails; the saved configuration stays editable. */
export const CatalogError = { render: () => catalogStory("error") }

/** Provider is in the catalog, but the saved model is not. */
export const ModelNotInCatalog = { render: () => catalogStory("ready", { ...MODEL_CONFIG, model: "legacy-model" }) }

// 目录收窄后（issue 7aa58）目录外的已保存 provider 就是「自定义」：provider 与 model
// 换成文本输入，用户继续编辑自己的服务标识，不再是一个禁用的下拉。
/** Saved provider is outside the whitelist, so both fields fall back to text inputs. */
export const ProviderNotInCatalog = { render: () => catalogStory("ready", { ...MODEL_CONFIG, provider: "legacy-openai", model: "legacy-model" }) }

/** Nothing selected yet: provider is empty, so the model select is disabled. */
export const NoProviderSelected = { render: () => catalogStory("ready", { ...MODEL_CONFIG, provider: "", model: "" }) }


/** Connection test in flight: the button shows a spinner and the testing hint. */
export const TestPending = {
  render: () => testPendingStory(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const label = i18n.t("settings.model.test")
    const button = Array.from(canvasElement.querySelectorAll("button")).find((item) => item.textContent?.includes(label))
    button?.click()
  },
}

/** Connection test succeeded: the ok message is shown. */
export const TestSuccess = { render: () => testResultStory(true, TEST_SUCCESS_MESSAGE) }

/** Connection test failed: only the failure message is shown. */
export const TestFailure = { render: () => testResultStory(false, TEST_FAILURE_MESSAGE) }
