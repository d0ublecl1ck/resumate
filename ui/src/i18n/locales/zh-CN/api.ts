// 启发式解析返回的文案：JD 草案的字段标签与提示。
export default {
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
}
