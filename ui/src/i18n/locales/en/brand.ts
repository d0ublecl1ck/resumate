// Brand-grammar copy: logo, mascot dialogue and branded states. Pages may override with domain wording.
export default {
  name: "Resumate",
  markAlt: "Resumate logo",
  pending: "Thinking…",
  volume: {
    plain: "Baseline · generic cards",
    grammar: "Grammar · sticker surfaces",
    badge: "Grammar + mark",
    character: "Grammar + character",
  },
  state: {
    empty: {
      title: "Nothing here yet",
      description: "Start with one sentence, and Resumate turns it into a line on your resume.",
    },
    loading: {
      title: "Getting things ready…",
      description: "Reading your material. Almost there.",
    },
    error: {
      title: "This step did not go through",
      description: "Your work is kept. Fix it and try again.",
    },
    forbidden: {
      title: "You need higher access here",
      description: "Ask an admin to grant it, or switch to another account.",
    },
    frozen: {
      title: "Draft is frozen",
      description: "Read-only while frozen. Unfreeze to keep editing.",
    },
  },
}
