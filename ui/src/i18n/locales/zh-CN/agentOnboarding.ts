export default {
  state: {
    checking: {
      stamp: "读取中",
      title: "正在检查助手状态",
      description: "正在读取模型与运行体配置，请稍候。",
    },
    load_failed: {
      stamp: "读取失败",
      title: "助手配置读取失败",
      description: "没能读到模型配置，可能是服务暂时不可用。可以重试，不需要先去设置页。",
      action: "重试",
    },
    forbidden: {
      stamp: "无权限",
      title: "没有权限读取助手配置",
      description: "当前账号无权查看助手配置，重试也不会改变结果，请联系管理员。",
    },
    model_missing: {
      stamp: "还差一步",
      title: "先把助手开起来",
      description: "去设置里把助手需要的信息填好，回来就能开始整理你的经历。",
      action: "去设置",
    },
    runtime_offline: {
      stamp: "暂不可用",
      title: "助手暂时不可用",
      description: "助手现在还不能聊天，请稍后再试。",
    },
    available: {
      stamp: "可以开始",
      title: "说说你的经历",
      description: "把想到的经历直接告诉我就好，我会先整理一版给你看；你确认后，才会写进个人资料。",
      action: "开始聊聊",
    },
  },
}
