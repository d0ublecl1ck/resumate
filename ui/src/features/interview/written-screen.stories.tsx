import { Screen } from "@/storybook/screen"
import { WrittenScreen } from "./written-screen"

export default { title: "Interview/Written" }

export const Default = {
  render: () => (
    <Screen path="/interview/written" routePath="/interview/written" width="fluid">
      <WrittenScreen />
    </Screen>
  ),
}
