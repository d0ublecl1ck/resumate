import { PlanScreen } from "./plan-screen"
import { Screen } from "@/storybook/screen"

export default { title: "Interview/Plan" }

export const Default = {
  render: () => (
    <Screen path="/interview/plan" routePath="/interview/plan">
      <PlanScreen />
    </Screen>
  ),
}
