export default {
  eyebrow: "Role Question Bank",
  title: "Role Question Bank and Knowledge Base",
  description:
    "Covers two roles, Java backend and Web frontend. Each role keeps four question types, technical knowledge, project deep dive, scenario, and behavioral, scored by that role's own rubric.",
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
    difficulty: {
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
    questions: {
      q1: {
        text: "How does HashMap resize in JDK 8?",
        source: "Java Collections · HashMap resize",
      },
      q2: {
        text: "What capacity evidence supports sharding the order service?",
        source: "Order Platform Project File · Capacity Review",
      },
      q3: {
        text: "How do you protect the database when peak traffic spikes tenfold?",
        source: "High-Concurrency Design · Rate Limiting and Fallback",
      },
      q4: {
        text: "Describe a time you led a postmortem and drove improvements.",
        source: "Behavioral Rubric · Ownership and Retrospective",
      },
      q5: {
        text: "When does a Spring transaction fail to take effect?",
        source: "Spring Transaction Management · Failure Cases",
      },
      w1: {
        text: "What steps does a browser take from URL input to first paint?",
        source: "Browser Rendering · Critical Rendering Path",
      },
      w2: {
        text: "How does your component library do on-demand loading and style isolation?",
        source: "Frontend Engineering File · Component Library Split",
      },
      w3: {
        text: "LCP suddenly regressed to 4 seconds. How would you localize it?",
        source: "Performance · Core Web Vitals",
      },
      w4: {
        text: "Describe a time you pushed the team toward one engineering standard.",
        source: "Behavioral Rubric · Influence and Drive",
      },
      w5: {
        text: "What specific problem does React concurrent rendering solve?",
        source: "React Runtime · Concurrent Features",
      },
    },
  },
  knowledge: {
    title: "Knowledge Base Search",
    caption: "Only matched knowledge entries are cited; no inference is made on a miss",
    sourceLabel: "Source",
    queryLabel: "Query",
    summaryLabel: "Matched summary",
    noSummaryLabel: "No citation produced",
    status: {
      matched: "Citation matched",
      insufficient: "Insufficient basis · no citation produced",
    },
    entries: {
      e1: {
        name: "Java Collections · HashMap resize",
        summary: "JDK 8 splits bins by the high bit on resize, treeifies at 8, and untreeifies at 6.",
      },
      e2: {
        name: "High-Concurrency Design · Rate Limiting and Fallback",
        summary: "Gateway token-bucket limiting with downstream circuit breaking and isolated pools.",
      },
      e4: {
        name: "Incident Retrospective · Ownership Boundary",
        summary: "No matching entry exists in the knowledge base, so no citation is produced.",
      },
      we1: {
        name: "Browser Rendering · Critical Rendering Path",
        summary: "HTML parse, style, layout, paint, and composite; blocking resources delay first paint.",
      },
      we2: {
        name: "Frontend Engineering · Component Library Split",
        summary: "ESM on-demand imports with CSS Modules avoid shipping the whole bundle and styles.",
      },
      we4: {
        name: "Micro-frontend Migration · Sandbox Options",
        summary: "No matching entry exists in the knowledge base, so no citation is produced.",
      },
    },
  },
}
