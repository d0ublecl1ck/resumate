// 品牌语法文案：标志、吉祥物对话与品牌空态。业务页面可覆盖为更具体的领域措辞。
export default {
  name: "Resumate",
  markAlt: "Resumate 标志",
  pending: "正在想…",
  state: {
    empty: {
      title: "这里还是空的",
      description: "先从一句话开始，Resumate 会帮你把它变成一条经历。",
    },
    loading: {
      title: "正在整理…",
      description: "读取你的资料，马上就好。",
    },
    error: {
      title: "这一步没走通",
      description: "内容已保留，改完再试一次。",
    },
    forbidden: {
      title: "这里需要更高权限",
      description: "找管理员开通，或换一个账号。",
    },
    frozen: {
      title: "草稿已冻结",
      description: "冻结期间只读，解除后可继续编辑。",
    },
  },
}
