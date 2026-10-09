export default {
  eyebrow: "Interview Prep",
  title: "Create a Mock Interview",
  description:
    "This session freezes a snapshot of the selected resume version and target JD; later edits to either will not affect it.",
  status: {
    draft: "Configuring",
    ready: "Ready",
    created: "Created",
  },
  resume: {
    title: "Choose a Resume Version",
    caption: "The selected version is the only source used in this session",
    versions: {
      v1: { name: "Resume v1 · Campus", updated: "Updated 2026-09-28" },
      v2: { name: "Resume v2 · Experienced", updated: "Updated 2026-10-05" },
      v3: { name: "Resume v3 · Targeted", updated: "Updated 2026-10-08" },
    },
  },
  jd: {
    title: "Choose a Target JD",
    caption: "A session locks exactly one target JD",
    optionValue: "{{role}} · {{company}}",
    options: {
      j1: { role: "Java Backend Engineer", company: "Xinglan Tech" },
      j2: { role: "Senior Backend Engineer", company: "Yunqi Data" },
      j3: { role: "Web Frontend Engineer", company: "Tide Interactive" },
    },
    pasteLabel: "Paste JD text",
    pastePlaceholder: "Paste the raw JD here as extra context for this session",
    pasteCount: "{{n}} characters entered",
  },
  role: {
    title: "Choose a Role",
    caption: "The role sets the question bank and the scoring rubric",
    options: {
      java: "Java Backend",
      web: "Web Frontend",
    },
  },
  snapshot: {
    title: "Session Snapshot",
    caption: "Updates live with the left panel and freezes on confirm",
    fields: {
      resume: "Resume version",
      jd: "Target JD",
      role: "Role",
    },
    empty: "Not selected",
    matchTitle: "Matches",
    riskTitle: "Risks",
    scopeTitle: "Role scope",
    match: {
      j1: {
        m1: "The order platform project matches the JD's distributed transaction duties",
        m2: "Spring and MyBatis years meet the JD's three-year requirement",
        m3: "High-concurrency limiting and fallback experience fits the JD's stability focus",
      },
      j2: {
        m1: "The data pipeline project matches the JD's data platform direction",
        m2: "Hands-on sharding and capacity planning experience",
        m3: "Led a team of four, matching the JD's technical lead requirement",
      },
      j3: {
        m1: "React and TypeScript stack matches the JD exactly",
        m2: "Component library work matches the JD's engineering duties",
        m3: "Quantified first-paint performance optimization cases",
      },
    },
    risk: {
      j1: {
        r1: "The JD requires hands-on Kafka, while the resume only shows familiarity",
        r2: "No multi-active disaster recovery case that the JD emphasizes",
      },
      j2: {
        r1: "The JD requires Flink streaming, which the resume does not show",
        r2: "The resume does not quantify data scale or performance gains",
      },
      j3: {
        r1: "The JD requires Node.js BFF work, while the resume is frontend only",
        r2: "No cross-platform or mini-program experience",
      },
    },
    scope: {
      java: { k1: "Java 17", k2: "Spring Cloud", k3: "Concurrency and Stability" },
      web: { k1: "React 19", k2: "TypeScript", k3: "Frontend Engineering" },
    },
  },
  footer: {
    missingPrefix: "Missing: ",
    separator: ", ",
    missingResume: "resume version",
    missingJd: "target JD",
    missingRole: "role",
    readyHint: "All three selected; confirming freezes this snapshot",
    confirm: "Confirm and Start Interview",
    frozen: "Snapshot frozen · this session is immutable",
    sessionLabel: "Session ID",
    reset: "Choose again",
  },
}
