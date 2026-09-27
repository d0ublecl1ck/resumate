import { Screen } from "@/storybook/screen"
import { TemplateEditorPage } from "./template-editor"

export default { title: "Pages/TemplateEditor" }

export const ValidationFailed = {
  render: () => (
    <Screen path="/admin/templates/tpl_compact" routePath="/admin/templates/:id">
      <TemplateEditorPage />
    </Screen>
  ),
}

export const ReadyToPublish = {
  render: () => (
    <Screen path="/admin/templates/tpl_classic" routePath="/admin/templates/:id">
      <TemplateEditorPage />
    </Screen>
  ),
}
