import { Screen } from "@/storybook/screen"
import { TemplatesPage } from "./templates"

export default { title: "Pages/Templates" }

export const Default = {
  render: () => (
    <Screen path="/admin/templates" routePath="/admin/templates">
      <TemplatesPage />
    </Screen>
  ),
}
