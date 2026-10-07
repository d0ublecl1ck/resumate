export default {
  state: {
    checking: {
      stamp: "Checking",
      title: "Checking the assistant",
      description: "Reading the model and runtime setup. This will only take a moment.",
    },
    load_failed: {
      stamp: "Load failed",
      title: "Couldn't load the assistant setup",
      description: "We couldn't read your model configuration. The service may be temporarily unavailable. You can retry without opening Settings.",
      action: "Retry",
    },
    forbidden: {
      stamp: "No access",
      title: "You don't have access to the assistant setup",
      description: "Your account isn't allowed to view the assistant configuration. Retrying won't help; contact an administrator.",
    },
    model_missing: {
      stamp: "One step left",
      title: "Finish setting up",
      description: "Complete the setup in Settings, then come back to start shaping your experience into a resume.",
      action: "Open Settings",
    },
    runtime_offline: {
      stamp: "Not available",
      title: "The assistant is unavailable",
      description: "The assistant isn't available right now, so you can't chat with it yet. Please try again later.",
    },
    available: {
      stamp: "Ready to go",
      title: "Tell us your story",
      description: "Just tell me about your experience in your own words. I'll shape it into a draft for you to review before it's added to your profile.",
      action: "Start chatting",
    },
  },
}
