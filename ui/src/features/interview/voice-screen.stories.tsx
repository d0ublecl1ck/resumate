import { Screen } from "@/storybook/screen"
import { VoiceScreen } from "./voice-screen"

// 设计预览：不传 props，VoiceScreen 回退到文件内的设计样例题目与上下文；
// 录音 / 转写链路本身是真实的（MediaRecorder + 云端 ASR），失败时明确降级。
export default { title: "Interview/Voice" }

export const Default = {
  render: () => (
    <Screen path="/interview/voice" routePath="/interview/voice" width="fluid">
      <VoiceScreen />
    </Screen>
  ),
}
