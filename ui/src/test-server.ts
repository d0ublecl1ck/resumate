// Vitest 用 MSW 服务器：handlers 与 Storybook 预览共用同一份定义。
// 语音识别配置（/speech/config）是本轮新增端点，默认返回「未配置」；
// 需要其它状态的测试再用 server.use(...) 覆盖。
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"

import { handlers } from "@/mocks/handlers"

export const DEFAULT_SPEECH_CONFIG = {
  provider: "dashscope",
  region: "cn-beijing",
  endpoint: "",
  model: "paraformer-v2",
  keyConfigured: false,
}

export const server = setupServer(...handlers, http.get("/api/speech/config", () => HttpResponse.json(DEFAULT_SPEECH_CONFIG)))
export { handlers }
