import { Screen } from "@/storybook/screen"
import { WorkbenchPage } from "./workbench"

export default { title: "Pages/Workbench" }

export const Default = {
  render: () => (
    <Screen path="/" routePath="/">
      <WorkbenchPage />
    </Screen>
  ),
}
