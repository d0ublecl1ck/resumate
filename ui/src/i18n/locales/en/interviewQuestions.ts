export default {
  eyebrow: "Question Generation",
  title: "Generate Interview Questions from Resume and Role",
  description:
    "Pick a role and filters to generate interview questions from resume entries and role requirements; every question traces back to a concrete resume source.",
  actions: {
    generate: "Generate questions",
    regenerate: "Regenerate",
  },
  filters: {
    position: "Role",
    difficulty: "Difficulty",
    type: "Type",
    hint: "Unselected means no limit",
  },
  positions: {
    java: "Java Backend",
    web: "Web Frontend",
  },
  difficulties: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  },
  types: {
    technical: "Technical Knowledge",
    deepDive: "Project Deep Dive",
    scenario: "Scenario",
    behavioral: "Behavioral",
  },
  status: {
    generating: "Generating questions",
    generatingHint: "Reading resume entries and role requirements",
    resultMeta: "{{role}} - {{n}} questions",
  },
  notice: {
    regenerate: "Question snapshots in past practice sessions will not be rewritten",
  },
  list: {
    title: "Generated Questions",
    caption: "Click any row to see the full detail",
    empty: "No question matches the current filters. Adjust the filters.",
    sourceLabel: "Basis",
  },
  detail: {
    title: "Question Detail",
    empty: "Select a question on the left to see its detail.",
    resumeVersion: "Resume version",
    resumeEntry: "Linked entry",
    evidenceLabel: "Evidence and reference points",
    answerLabel: "Reference answer",
    answerOpen: "Hide reference answer",
    answerClosed: "Show reference answer",
  },
  batches: {
    a: {
      q1: {
        text: "What capacity evidence supports sharding the order service?",
        source: "Order Platform Project - Capacity Review",
        description:
          "Using the order platform capacity data from your resume, explain how you derived the shard count and shard key.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Order Platform - Sharding Rework",
        evidence: {
          e1: "Resume record: the order table grows about 8 million rows a day and passes 200 million rows in one table.",
          e2: "The shard key is user ID, so all orders of one user land on the same shard.",
          e3: "Estimated three-year capacity with a 30 percent growth buffer.",
        },
        answer:
          "Start from the current single-table capacity and write QPS, then project three-year growth to decide whether sharding is needed. Derive the shard count from the target single-table capacity, and pick a shard key that keeps queries on the user dimension to avoid scatter-gather scans.",
      },
      q2: {
        text: "After sharding, how did you handle cross-shard order queries and statistics?",
        source: "Order Platform Project - Cross-Shard Query",
        description:
          "Explain the trade-offs for cross-shard queries: which stay online and which move to offline statistics.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Order Platform - Query Aggregation",
        evidence: {
          e1: "Resume record: the order list needs multi-dimensional filtering by time and status.",
          e2: "Cross-shard sorting fetches the top N from each shard and merges in memory.",
          e3: "Reporting statistics subscribe to binlog and write into the offline warehouse.",
        },
        answer:
          "Separate online queries from reporting. Online queries route by shard key, or fetch top N per shard and merge in memory. Reports sync through binlog into the warehouse and run offline, so the database never does full cross-shard aggregation.",
      },
      q3: {
        text: "When peak traffic spikes tenfold, how do you protect the downstream database?",
        source: "High-Concurrency Design - Rate Limiting and Fallback",
        description: "Give the full protection order from ingress rate limiting to database connection isolation.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Peak Campaign - Stability Plan",
        evidence: {
          e1: "The gateway applies per-endpoint token-bucket limiting and returns a queue notice when exceeded.",
          e2: "Non-core paths break and degrade to keep ordering and payment on the main path.",
          e3: "Database connection pools are isolated per business line so one line cannot exhaust them.",
        },
        answer:
          "Shape traffic at the ingress first, then degrade non-core features by business priority, and finally isolate connection pools to protect the main path. Move hot reads into cache so they never reach the database.",
      },
      q4: {
        text: "Describe a time you led a postmortem and drove improvements.",
        source: "Behavioral Rubric - Ownership and Retrospective",
        description: "Use a concrete event to show your postmortem method, ownership boundary, and shipped improvements.",
        resumeVersion: "Resume v2 (2025-11-02)",
        resumeEntry: "Incident Postmortem - Improvement Loop",
        evidence: {
          e1: "Root cause traced to a missing config change validation.",
          e2: "Drove two-person config review and a rollback plan.",
          e3: "Postmortem findings went into the team checklist and were reviewed within two weeks.",
        },
        answer:
          "Reconstruct the timeline of facts, define system and process problems before personal blame, and turn findings into executable checklist items with an agreed review date so the retrospective does not stop at words.",
      },
      q5: {
        text: "Your resume says first-screen load dropped from 3.2s to 1.1s. How exactly did you do that?",
        source: "Resume v3 - Frontend Performance",
        description: "Break down each first-screen optimization step and its contribution to the metric.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Web Performance - First Screen Load",
        evidence: {
          e1: "Route-level code splitting cut the first bundle from 1.4MB to 620KB.",
          e2: "Images switched to WebP and lazy-load by viewport.",
          e3: "API calls run in parallel and critical resources preload.",
        },
        answer:
          "Use the performance panel to find whether the bottleneck is bundle size or serial requests, then apply route-level splitting, image compression and lazy loading, and parallel API calls. Re-measure each step with the same metric and keep only confirmed wins.",
      },
      q6: {
        text: "How do you guarantee API idempotency in technical terms?",
        source: "API Design - Idempotency",
        description: "Give the full scheme for idempotency keys, dedup storage, and concurrent writes.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Order Platform - API Design",
        evidence: {
          e1: "The client generates an idempotency key and the server writes a unique index per business dimension.",
          e2: "Check the dedup table before execution and return the first result for repeats.",
          e3: "Concurrent cases fall back to a distributed lock or a database unique constraint.",
        },
        answer:
          "The client generates the idempotency key and sends it with the request; the server records the result in a dedup table or unique index. Repeat requests return the first result, and concurrent writes are caught by the unique constraint so the effect happens only once.",
      },
    },
    b: {
      q1: {
        text: "How did you measure the 40 percent QPS improvement on your resume?",
        source: "Resume v3 - Performance Metrics",
        description: "Explain the benchmark method, the metric definition, and the before/after conditions.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Performance Work - Benchmarking",
        evidence: {
          e1: "Stress tests used a fixed dataset and fixed concurrency, recording P95 and QPS.",
          e2: "The same script ran before and after to exclude environment differences.",
          e3: "The median of three runs avoids single-run jitter.",
        },
        answer:
          "Fix the dataset, concurrency, and machine spec, then run the same script before and after. Report median P95 and QPS, state each optimization's separate contribution, and avoid concluding from a peak number alone.",
      },
      q2: {
        text: "If you had to split the monolith into microservices, which layer would you split first?",
        source: "Architecture Evolution - Service Split",
        description: "Give the split priority, the boundary rationale, and the migration approach.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Architecture Evolution - Service Split",
        evidence: {
          e1: "Priority goes to ordering and payment, which change often and need independent scaling.",
          e2: "Services are split by domain boundary, not by database table.",
          e3: "The migration keeps the monolith entry, shifts traffic gradually, and double-writes for verification.",
        },
        answer:
          "Split the modules that change often and need independent scaling, by domain boundary rather than tables. During migration, use a strangler approach to keep the old entry, shift traffic gradually, and double-write for reconciliation instead of a big-bang rewrite.",
      },
      q3: {
        text: "How do you usually keep cache and database consistent?",
        source: "Cache Design - Consistency",
        description: "Compare the trade-offs of delete-cache-first versus update-database-first.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Order Platform - Cache Design",
        evidence: {
          e1: "Update the database, then delete the cache with a sensible expiry.",
          e2: "Delayed double delete covers primary-replica lag.",
          e3: "Strong-consistency reads hit the primary or use a distributed lock.",
        },
        answer:
          "The common path is update the database then delete the cache, with expiry as a backstop. Use delayed double delete under replication lag, and route strong-consistency reads to the primary or serialize with a lock so cache and database do not drift.",
      },
      q4: {
        text: "How do you handle a priority disagreement with the product manager?",
        source: "Behavioral Rubric - Collaboration",
        description: "Explain how you drive decisions with facts rather than positions.",
        resumeVersion: "Resume v2 (2025-11-02)",
        resumeEntry: "Cross-Functional Work - Requirements Review",
        evidence: {
          e1: "Align on the goal and constraints before debating options.",
          e2: "Use data or a small experiment instead of arguing.",
          e3: "Escalate when alignment fails and record the decision.",
        },
        answer:
          "Confirm both sides share the same goal and constraints, then compare options by data or a minimal experiment. If disagreement remains, lay out the trade-offs, ask the decision owner to choose, and record the outcome in the requirements doc.",
      },
      q5: {
        text: "How does your component library control bundle size and on-demand loading?",
        source: "Frontend Engineering - Component Library",
        description: "Explain artifact analysis, bundling strategy, and how consumers import.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Component Library - Engineering",
        evidence: {
          e1: "Each component has its own entry and supports on-demand import.",
          e2: "A size report sets a CI threshold and fails the build when exceeded.",
          e3: "Shared dependencies stay external as peerDependencies to avoid duplicate bundling.",
        },
        answer:
          "Publish each component with its own entry and keep ESM output, with shared dependencies external. Set a size-analysis threshold in CI to block regressions, let consumers import on demand, and split out a lightweight build when needed.",
      },
      q6: {
        text: "When an intermittent timeout appears in production, in what order do you investigate?",
        source: "Stability Triage - Timeout Localization",
        description: "Give the order from metrics to call path, plus the stop-loss action.",
        resumeVersion: "Resume v3 (2026-03-12)",
        resumeEntry: "Stability Triage - Production Issues",
        evidence: {
          e1: "Check the monitoring dashboard first to confirm scope and start time.",
          e2: "Walk the call path to find the segment with the highest latency.",
          e3: "If not found quickly, degrade for stop-loss first and do the postmortem offline.",
        },
        answer:
          "Confirm impact scope and start time from monitoring, then walk the call path to find the latency bottleneck. If it cannot be located quickly, degrade or rate-limit for stop-loss, preserve the scene, and do the postmortem offline instead of widening the impact while investigating.",
      },
    },
  },
}
