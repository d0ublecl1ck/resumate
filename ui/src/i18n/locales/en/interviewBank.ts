export default {
  eyebrow: "Role Question Bank",
  title: "Role Question Bank and Knowledge Base",
  description:
    "Covers two roles, Java backend and Web frontend. Each role keeps four question types, technical knowledge, project deep dive, scenario, and behavioral, scored by that role's own rubric.",
  total: "{{n}} questions in total",
  roleTotal: "{{role}}: {{n}} questions",
  filteredTotal: "{{n}} questions in current filter",
  position: {
    label: "Role",
    java: "Java Backend",
    web: "Web Frontend",
  },
  categories: {
    count: "{{n}} questions",
    filtered: "Filtered · click again to clear",
    technical: {
      label: "Technical Knowledge",
      description: "Language, framework, and fundamentals",
    },
    deepDive: {
      label: "Project Deep Dive",
      description: "Probing project detail and trade-offs",
    },
    scenario: {
      label: "Scenario",
      description: "Solution design for real business cases",
    },
    behavioral: {
      label: "Behavioral",
      description: "Collaboration, motivation, and reflection",
    },
  },
  list: {
    title: "Question List",
    caption: "Every question comes from the current role bank and carries its evaluation basis",
    sourceLabel: "Basis",
    filteredBy: "Filtered by \"{{category}}\"",
    clearFilter: "Clear filter",
    loading: "Loading questions…",
    error: "Failed to load the question bank. Please retry.",
    empty: "No questions in this role bank yet.",
    basisUnavailable: "No knowledge citation yet",
    difficulty: {
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
  },
  knowledge: {
    title: "Knowledge Base Search",
    caption: "Only matched knowledge entries are cited; no inference is made on a miss",
    questionLabel: "Question",
    sourceLabel: "Source",
    summaryLabel: "Matched summary",
    noSummaryLabel: "No citation produced",
    noMatchDescription: "No matching entry in the knowledge base; no citation is produced for this question.",
    empty: "No question in the current list to search.",
    missingCount: "{{n}} questions have no knowledge citation",
    status: {
      matched: "Citation matched",
      insufficient: "Insufficient basis · no citation produced",
    },
  },
}
