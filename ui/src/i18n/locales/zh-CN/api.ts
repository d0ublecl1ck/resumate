// 启发式解析返回的文案：基本信息 / JD / 事实草案的字段标签与提示。
export default {
  basics: {
    fields: {
      email: "邮箱",
      phone: "电话",
      location: "城市",
      headline: "头衔",
      fullName: "姓名",
    },
    note: "识别为对基本信息的修改。确认后立即更新，不影响你的经历与技能条目。",
  },
  jd: {
    extracted: {
      role: "岗位",
      company: "公司",
      source: "来源",
    },
    tags: {
      frontend: "前端",
      backend: "后端",
      performance: "性能优化",
      team: "团队",
      cEnd: "C 端",
      architecture: "架构",
    },
    note: {
      image: "已从截图识别内容，请核对后创建。",
      text: "已从粘贴文本中提取岗位、公司与标签。请核对后创建。",
      imageDemo: "已从截图「{{fileName}}」识别出以下内容（演示为示例数据）。请核对后再创建。",
    },
  },
  fact: {
    extracted: {
      time: "时间",
      type: "类型",
    },
    types: {
      achievement: "成果",
      certificate: "证书",
      education: "教育",
      project: "项目",
      skill: "技能",
      experience: "经历",
    },
    typeDefault: "经历（默认）",
    untitled: "未命名事实",
    note: {
      update: "识别为对已有事实「{{title}}」的补充更新。确认后将合并内容，证据状态保持待核实。",
      create: "识别为一条新事实。自然语言录入的内容默认为「待核实」，可在确认后上传证据再标记为已核实。",
    },
  },
}
