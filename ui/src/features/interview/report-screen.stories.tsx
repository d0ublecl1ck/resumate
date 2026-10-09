import { Screen } from "@/storybook/screen"
import type { ExpressionSummary } from "@/lib/speech-metrics"
import { InterviewReportScreen } from "./report-screen"

// 设计预览：不传 report，内容维度 / 亮点 / 不足 / 建议回退到文件内的设计样例；
// speech 显式传入两个表达维度样例，真实路由由 /interview/:id 传入真实报告与落库指标。
export default { title: "Interview/Report" }

// 实测样例：代表一段 60 秒、128 字的真实录音（128 字/分），只用于设计预览。
const VOICE_SAMPLE: ExpressionSummary = {
  hasAudio: true,
  segmentCount: 1,
  durationSeconds: 60,
  charCount: 128,
  paceCharsPerMin: 128,
  clarityLevel: "good",
  clarityScore: 88,
  fillerCount: 2,
  pauseCount: 5,
}

export const Default = {
  render: () => (
    <Screen path="/interview/report" routePath="/interview/report">
      <InterviewReportScreen speech={null} />
    </Screen>
  ),
}

export const Voice = {
  render: () => (
    <Screen path="/interview/report" routePath="/interview/report">
      <InterviewReportScreen speech={VOICE_SAMPLE} />
    </Screen>
  ),
}
