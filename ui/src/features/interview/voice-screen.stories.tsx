import { Screen } from "@/storybook/screen"
import { VoiceScreen } from "./voice-screen"

export default { title: "Interview/Voice" }

export const Default = {
  render: () => (
    <Screen path="/interview/voice" routePath="/interview/voice">
      <VoiceScreen />
    </Screen>
  ),
}
