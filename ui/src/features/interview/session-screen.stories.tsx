import { Screen } from "@/storybook/screen"
import { SessionScreen } from "./session-screen"

// 设计预览：不传 props，SessionScreen 回退到文件内的设计样例会话，不发任何网络请求。
// 真实路由请见 /interview/:id（由 ui/src/pages/interview-session.tsx 编排真实数据）。
export default { title: "Interview/Session" }

export const InProgress = {
  render: () => (
    <Screen path="/interview/session" routePath="/interview/session">
      <SessionScreen />
    </Screen>
  ),
}
