export default {
  eyebrow: "岗位题库",
  title: "岗位题库与知识库",
  description:
    "覆盖 Java 后端与 Web 前端两个岗位。每个岗位维护技术知识、项目深挖、场景、行为四类题，并按各自岗位的评价标准评分。",
  position: {
    label: "岗位",
    java: "Java 后端",
    web: "Web 前端",
  },
  categories: {
    count: "{{n}} 题",
    filtered: "已筛选 · 再点一次取消",
    technical: {
      label: "技术知识",
      description: "语言、框架与底层原理",
    },
    deepDive: {
      label: "项目深挖",
      description: "追问项目细节与关键取舍",
    },
    scenario: {
      label: "场景",
      description: "真实业务场景的方案设计",
    },
    behavioral: {
      label: "行为",
      description: "协作、动机与复盘表达",
    },
  },
  list: {
    title: "题目列表",
    caption: "题目全部来自当前岗位题库，每道题都标注了评价依据",
    sourceLabel: "依据",
    filteredBy: "已按「{{category}}」筛选",
    clearFilter: "清除筛选",
    difficulty: {
      easy: "简单",
      medium: "中等",
      hard: "困难",
    },
    questions: {
      q1: {
        text: "HashMap 在 JDK 8 中的扩容机制是怎样的？",
        source: "Java 集合框架 · HashMap 扩容",
      },
      q2: {
        text: "订单服务做分库分表的容量依据是什么？",
        source: "订单中台项目档案 · 容量评估",
      },
      q3: {
        text: "大促流量突增十倍时，如何保护下游数据库？",
        source: "高并发稳定性设计 · 限流与降级",
      },
      q4: {
        text: "讲一次你主导复盘并推动改进的经历。",
        source: "行为评价标准 · 责任与复盘",
      },
      q5: {
        text: "Spring 事务在哪些情况下会失效？",
        source: "Spring 事务管理 · 失效场景",
      },
      w1: {
        text: "从输入 URL 到首屏渲染，浏览器完整走了哪些步骤？",
        source: "浏览器渲染 · 关键渲染路径",
      },
      w2: {
        text: "你们的组件库如何做按需加载和样式隔离？",
        source: "前端工程化项目档案 · 组件库拆分",
      },
      w3: {
        text: "首屏 LCP 突然退化到 4 秒，你会如何定位？",
        source: "性能优化 · Core Web Vitals",
      },
      w4: {
        text: "讲一次你推动团队统一工程规范的经历。",
        source: "行为评价标准 · 影响力与推动",
      },
      w5: {
        text: "React 的并发渲染具体解决了什么问题？",
        source: "React 运行时 · 并发特性",
      },
    },
  },
  knowledge: {
    title: "知识库检索",
    caption: "只引用命中的知识条目，未命中时不做任何推断",
    sourceLabel: "来源",
    queryLabel: "检索词",
    summaryLabel: "命中摘要",
    noSummaryLabel: "未生成引用",
    status: {
      matched: "引用命中",
      insufficient: "依据不足 · 不生成引用",
    },
    entries: {
      e1: {
        name: "Java 集合框架 · HashMap 扩容",
        summary: "JDK 8 扩容时按高位拆分链表，树化阈值为 8，退化阈值为 6。",
      },
      e2: {
        name: "高并发稳定性设计 · 限流与降级",
        summary: "网关令牌桶限流配合下游熔断降级，数据库连接池按业务隔离。",
      },
      e4: {
        name: "线上事故复盘 · 责任界定",
        summary: "知识库中没有匹配条目，本题不生成任何引用。",
      },
      we1: {
        name: "浏览器渲染 · 关键渲染路径",
        summary: "HTML 解析、样式计算、布局、绘制、合成；阻塞资源会推迟首屏。",
      },
      we2: {
        name: "前端工程化 · 组件库拆分",
        summary: "ESM 按需导入配合 CSS Modules，避免整包样式与运行时全量注入。",
      },
      we4: {
        name: "微前端迁移 · 沙箱方案",
        summary: "知识库中没有匹配条目，本题不生成任何引用。",
      },
    },
  },
}
