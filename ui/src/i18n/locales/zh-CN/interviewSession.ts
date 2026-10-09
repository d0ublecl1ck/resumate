// 模拟面试会话（Interview/Session）屏幕文案。
export default {
  meta: {
    eyebrow: "模拟面试",
    title: "Java 后端 · 模拟面试进行中",
    description: "本场已冻结简历版本与目标 JD，题目取自该岗位题库，并挂载知识条目作为评分依据。",
  },
  header: {
    voiceChannel: "语音通道正常",
    elapsed: "已进行 18 分钟",
  },
  conversation: {
    title: "对话流",
    caption: "语音与文字双通道 · 转写可逐句核对",
    interviewer: "面试官",
    candidate: "我",
    tag: {
      technical: "技术知识",
      followUp: "追问",
    },
    channelVoice: "语音回答",
    channelText: "文字回答",
    transcriptVerified: "转写已核对",
    sourceLine: "知识来源：{{source}}",
    basisLine: "追问依据：{{basis}}",
    turns: {
      q1: "先说说 JVM 的内存区域划分，以及线上排查内存问题时你最先看哪几块。",
      q1Source: "JVM 内存模型 · 知识条目 #204",
      a1: "堆和元空间是重点。我一般先看堆的分配速率和 GC 日志，再对比元空间与线程栈的增长趋势。",
      q2: "你提到了分代回收，但没有说明 CMS 与 G1 在停顿和吞吐上的取舍，请补充你项目里为什么选 G1。",
      q2Gap: "缺失要点：CMS 与 G1 的停顿 / 吞吐取舍",
      a2: "我们服务堆 8G、对延迟敏感，G1 可以设置目标停顿并做可预测的 Mixed GC，所以从 CMS 迁移到了 G1。",
    },
  },
  dynamic: {
    followUp: "你刚提到「{{keyword}}」，能具体说说这里的取舍和可量化的指标吗？",
    followUpNoKeyword: "收到。能再补一个具体的量化例子吗？",
  },
  session: {
    title: "本场信息",
    caption: "简历与 JD 在本场冻结",
    rows: {
      role: "岗位",
      roleValue: "Java 后端工程师",
      resume: "简历版本",
      resumeValue: "简历 v3 · 已冻结",
      jd: "目标 JD",
      jdValue: "后端社招 JD · 交易中台",
      scale: "量表版本",
      scaleValue: "能力量表 v1.0",
      elapsed: "已用时",
      elapsedValue: "18 分钟",
    },
  },
  voice: {
    title: "语音链路",
    caption: "双通道并行，异常自动降级",
    rows: {
      asr: "ASR 可用",
      asrDetail: "实时转写，回答后可逐句核对",
      tts: "TTS 可用",
      ttsDetail: "面试官语音播报，可随时暂停",
      fallback: "降级为纯文字",
      fallbackDetail: "语音不可用时保留完整上下文与追问链路",
    },
  },
  gaps: {
    title: "追问依据",
    caption: "根据当前回答自动标记的待补要点",
    items: {
      gcTradeoff: "CMS 与 G1 的停顿 / 吞吐取舍",
      offHeap: "堆外内存与元空间对 GC 的影响",
      quantify: "调优收益的量化口径（P99 / 吞吐）",
    },
  },
  composer: {
    placeholder: "输入你的回答，或按住麦克风用语音作答",
    mic: "语音作答",
    voiceSend: "语音回答",
    send: "发送",
  },
}
