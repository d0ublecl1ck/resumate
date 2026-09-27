import { Screen } from "@/storybook/screen"
import { JdsPage } from "./jds"

export default { title: "Pages/Jds" }

export const Default = {
  render: () => (
    <Screen path="/jds" routePath="/jds">
      <JdsPage />
    </Screen>
  ),
}

export const Empty = {
  render: () => (
    <Screen path="/jds" routePath="/jds" seed={[[["jds"], []]]}>
      <JdsPage />
    </Screen>
  ),
}
