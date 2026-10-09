import { Screen } from "@/storybook/screen"
import { BankScreen } from "./bank-screen"

export default { title: "Interview/Bank" }

export const JavaBackend = {
  render: () => (
    <Screen path="/interview/bank" routePath="/interview/bank">
      <BankScreen />
    </Screen>
  ),
}
