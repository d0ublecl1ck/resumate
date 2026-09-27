// Storybook confirmation artifact for the SCR-010 model settings catalog picker (f15af).
// Every catalog state is driven by MSW: the shared handlers stay untouched, and each story
// registers a scenario override before the form mounts (worker.use / worker.resetHandlers).
import { delay, http, HttpResponse } from "msw"
import { SettingsForm } from "@/components/settings-form"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import type { ModelConfig } from "@/lib/types"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"

type CatalogState = "ready" | "loading" | "error"

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

function CatalogStory({ state, model }: { state: CatalogState; model: ModelConfig }) {
  // Key on purpose: a new catalog state must mount a fresh QueryClient instead of
  // reusing the previous story's cached /api/models/catalog result.
  return (
    <Screen key={state + ":" + model.provider + ":" + model.model} path="/settings">
      <SettingsForm agent={AGENT_CONFIG} model={model} prefs={USER_PREFERENCES} templates={TEMPLATES} />
    </Screen>
  )
}

function catalogStory(state: CatalogState, model: ModelConfig = MODEL_CONFIG) {
  applyCatalogHandlers(state)
  return <CatalogStory state={state} model={model} />
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

/** Saved provider and model are both absent from the catalog. */
export const ProviderNotInCatalog = { render: () => catalogStory("ready", { ...MODEL_CONFIG, provider: "legacy-openai", model: "legacy-model" }) }

/** Nothing selected yet: provider is empty, so the model select is disabled. */
export const NoProviderSelected = { render: () => catalogStory("ready", { ...MODEL_CONFIG, provider: "", model: "" }) }
