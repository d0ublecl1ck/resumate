export default {
  state: {
    model_missing: {
      stamp: "模型未配置",
      title: "先配置一个模型",
      description: "当前账号还没有可用的模型凭证。到设置里填入 OpenAI 兼容的 Endpoint 与 API Key，助手才能开始工作。",
      action: "去设置模型",
    },
    runtime_offline: {
      stamp: "运行体未接入",
      title: "AI 能力尚未接入",
      description: "模型已经配置好，但还没有任何运行体进程在处理 Agent 请求。在你看到这条状态期间，对话与 Run 都不会执行。",
    },
    available: {
      stamp: "已接入",
      title: "随时可以开始",
      description: "直接说你的经历就行，助手会先给出一版改法，你确认之后才会写进主档。",
      action: "开始对话",
    },
  },
}
