export default {
  eyebrow: "岗位题库",
  title: "岗位题库与知识库",
  description:
    "覆盖 Java 后端与 Web 前端两个岗位。每个岗位维护技术知识、项目深挖、场景、行为四类题，并按各自岗位的评价标准评分。",
  total: "全库共 {{n}} 题",
  roleTotal: "{{role}} {{n}} 题",
  filteredTotal: "当前筛选 {{n}} 题",
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
    loading: "正在加载题目…",
    error: "题目加载失败，请重试。",
    empty: "该岗位题库暂无题目。",
    basisUnavailable: "知识库暂无引用",
    difficulty: {
      easy: "简单",
      medium: "中等",
      hard: "困难",
    },
  },
  knowledge: {
    title: "知识库检索",
    caption: "只引用命中的知识条目，未命中时不做任何推断",
    questionLabel: "题目",
    sourceLabel: "来源",
    summaryLabel: "命中摘要",
    noSummaryLabel: "未生成引用",
    noMatchDescription: "知识库中没有匹配条目，本题不生成任何引用。",
    empty: "当前列表没有可检索的题目。",
    missingCount: "{{n}} 道题没有知识库引用",
    status: {
      matched: "引用命中",
      insufficient: "依据不足 · 不生成引用",
    },
  },
}
