export default {
  state: {
    model_missing: {
      stamp: "Model not configured",
      title: "Configure a model first",
      description: "This account has no usable model credential yet. Add an OpenAI-compatible endpoint and API key in Settings before the assistant can work.",
      action: "Set up a model",
    },
    runtime_offline: {
      stamp: "Runtime not connected",
      title: "AI capabilities are not connected yet",
      description: "A model is configured, but no runtime process is handling agent requests. Until that changes, chat and runs will not execute.",
    },
    available: {
      stamp: "Connected",
      title: "Assistant ready",
      description: "The runtime is online and the model is usable. Describe an experience and the assistant proposes a change you confirm before it is written.",
      action: "Start chatting",
    },
  },
}
