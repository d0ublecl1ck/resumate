// 语音面试（Interview/Voice）屏幕文案。
export default {
  meta: {
    eyebrow: "语音面试",
    title: "听题作答，转写可核对",
    description: "题目以 TTS 语音播报，回答可按住说话并实时转写。语音链路不可用时保留既有上下文与追问链路，自动降级为文字作答。",
  },
  header: {
    outageSwitch: "模拟语音服务不可用",
    outageBadge: "已降级为文字作答",
    channelReady: "语音通道正常",
  },
  conversation: {
    title: "对话流",
    caption: "语音播报 + 转写核对",
    interviewer: "面试官",
    candidate: "我",
    channelVoice: "语音回答",
    channelText: "文字回答",
    verified: "转写已核对",
  },
  question: {
    label: "本轮题目",
    play: "播放题目（TTS）",
    playing: "播放中…",
    hint: "面试官语音播报 · 约 3 秒后自动停止",
    reListen: "可反复播放后再作答",
  },
  turns: {
    q1: "先讲讲你做过的一次接口性能优化，说明背景、你的动作和最终指标。",
    a1: "交易下单接口的 P99 从 800ms 降到 220ms，QPS 从 600 提到 1800。",
    q2: "你提到把逐条查询收敛成批量查询，请具体说说是怎么定位和改造的，以及怎么验证收益。",
  },
  answer: {
    title: "我的回答",
    caption: "语音作答；语音服务不可用时降级为文字",
    notGranted: {
      title: "需要麦克风权限",
      body: "授权后音频仅在本地转写，原始录音不上传，也不会写入本轮记录。",
      allow: "允许使用麦克风",
      privacy: "可随时在浏览器里撤销授权",
    },
    ready: {
      hold: "按住说话",
      hint: "点击开始录音，结束后生成转写文本",
      recording: "录音中",
      stop: "结束录音",
    },
    transcribe: {
      title: "转写结果（可编辑）",
      hint: "确认前不进入评分",
      sample: "下单接口原来在循环里逐条查商品，我改成一次批量查询并加了本地缓存，把 SQL 次数从 120 次降到 3 次，P99 降到 220ms。",
      confirm: "已核对",
    },
    confirmed: {
      badge: "已确认回答",
      rerecord: "重新录制",
    },
    degraded: {
      banner: "语音通道不可用，已降级为文字作答，既有上下文与追问链路已保留",
      placeholder: "输入你的回答…",
      send: "发送",
    },
  },
  panel: {
    voice: {
      title: "语音链路状态",
      caption: "随顶部「模拟语音服务不可用」开关切换",
      available: "可用",
      unavailable: "不可用",
      asr: "ASR 实时转写",
      asrDetail: "边录边转，核对确认后写入本轮记录",
      asrDownDetail: "转写通道已关闭，改用文字输入",
      tts: "TTS 题目播报",
      ttsDetail: "题目语音播报，可随时停止",
      ttsDownDetail: "播报通道已关闭，题目仅以文字展示",
    },
    session: {
      title: "本场信息",
      caption: "简历与 JD 在本场冻结",
      role: "岗位",
      roleValue: "Java 后端工程师",
      scale: "量表版本",
      scaleValue: "能力量表 v1.0",
      elapsed: "已用时",
      elapsedValue: "18 分钟",
    },
    gaps: {
      title: "追问依据",
      caption: "根据当前回答自动标记的待补要点",
      items: {
        sqlCount: "批量查询改造前后的 SQL 次数与耗时对比",
        cacheConsistency: "本地缓存与数据库的一致性方案（失效顺序）",
        metricScope: "收益的量化口径（P99 与 QPS 的采样窗口）",
      },
    },
  },
}
