import { Screen } from "@/storybook/screen"
import { QuestionsScreen } from "./questions-screen"

export default { title: "Interview/Questions" }

export const Default = {
  render: () => (
    <Screen path="/interview/questions" routePath="/interview/questions">
      <QuestionsScreen />
    </Screen>
  ),
}
