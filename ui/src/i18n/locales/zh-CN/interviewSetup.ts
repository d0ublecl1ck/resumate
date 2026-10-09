export default {
  eyebrow: "面试准备",
  title: "创建一场模拟面试",
  description:
    "本场面试会固定当前简历版本与目标 JD 的快照，面试过程中不会随后续修改而变化。",
  status: {
    draft: "配置中",
    ready: "可开始",
    created: "已创建",
  },
  resume: {
    title: "选择简历版本",
    caption: "整场面试以选中版本的内容为唯一依据",
    versions: {
      v1: { name: "简历 v1 · 校招版", updated: "更新于 2026-09-28" },
      v2: { name: "简历 v2 · 社招版", updated: "更新于 2026-10-05" },
      v3: { name: "简历 v3 · 定向版", updated: "更新于 2026-10-08" },
    },
  },
  jd: {
    title: "选择目标 JD",
    caption: "一场面试只锁定一条目标 JD",
    optionValue: "{{role}} · {{company}}",
    options: {
      j1: { role: "Java 后端工程师", company: "星澜科技" },
      j2: { role: "资深后端工程师", company: "云栖数据" },
      j3: { role: "Web 前端工程师", company: "潮汐互动" },
    },
    pasteLabel: "粘贴 JD 文本",
    pastePlaceholder: "把 JD 原文粘贴到这里，作为本场的补充背景",
    pasteCount: "已输入 {{n}} 字",
  },
  role: {
    title: "选择岗位",
    caption: "岗位决定题库范围与评分量表",
    options: {
      java: "Java 后端",
      web: "Web 前端",
    },
  },
  snapshot: {
    title: "本场快照",
    caption: "随左侧选择实时更新，确认后冻结",
    fields: {
      resume: "简历版本",
      jd: "目标 JD",
      role: "岗位",
    },
    empty: "未选择",
    matchTitle: "匹配点",
    riskTitle: "风险点",
    scopeTitle: "岗位范围",
    match: {
      j1: {
        m1: "简历中的订单中台项目与 JD 的分布式交易职责一致",
        m2: "Spring 与 MyBatis 使用年限满足 JD 的三年以上要求",
        m3: "有高并发限流降级经验，对应 JD 的稳定性要求",
      },
      j2: {
        m1: "数据链路项目与 JD 的数据平台方向匹配",
        m2: "有分库分表与容量评估的落地经验",
        m3: "带过四人小组，对应 JD 的技术带队要求",
      },
      j3: {
        m1: "React 与 TypeScript 技术栈和 JD 完全一致",
        m2: "组件库建设经验对应 JD 的工程化职责",
        m3: "有首屏性能优化的量化改善案例",
      },
    },
    risk: {
      j1: {
        r1: "JD 要求 Kafka 实战经验，简历只体现为了解",
        r2: "缺少 JD 强调的多活容灾落地案例",
      },
      j2: {
        r1: "JD 要求 Flink 实时计算，简历未体现",
        r2: "简历未量化数据规模与性能收益",
      },
      j3: {
        r1: "JD 要求 Node.js 中间层经验，简历只有前端",
        r2: "缺少跨端或小程序相关经历",
      },
    },
    scope: {
      java: { k1: "Java 17", k2: "Spring Cloud", k3: "高并发与稳定性" },
      web: { k1: "React 19", k2: "TypeScript", k3: "前端工程化" },
    },
  },
  footer: {
    missingPrefix: "还差：",
    separator: "、",
    missingResume: "简历版本",
    missingJd: "目标 JD",
    missingRole: "岗位",
    readyHint: "三项已选齐，确认后将冻结本场快照",
    confirm: "确认开始面试",
    frozen: "已冻结快照 · 本场不可变",
    sessionLabel: "场次编号",
    reset: "重新选择",
  },
}
