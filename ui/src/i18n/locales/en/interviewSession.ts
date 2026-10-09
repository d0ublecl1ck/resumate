// Copy for the mock interview session (Interview/Session) screen.
export default {
  meta: {
    eyebrow: "Mock interview",
    title: "Java Backend · Mock interview in progress",
    description: "This session locks the resume version and target JD; questions come from the role question bank and cite knowledge entries as scoring evidence.",
  },
  header: {
    voiceChannel: "Voice channel healthy",
    elapsed: "18 minutes elapsed",
  },
  conversation: {
    title: "Conversation",
    caption: "Voice and text dual channel · transcripts reviewable line by line",
    interviewer: "Interviewer",
    candidate: "Me",
    tag: {
      technical: "Technical",
      followUp: "Follow-up",
    },
    channelVoice: "Voice answer",
    channelText: "Text answer",
    transcriptVerified: "Transcript verified",
    sourceLine: "Source: {{source}}",
    basisLine: "Follow-up basis: {{basis}}",
    turns: {
      q1: "Start with the JVM memory regions, and tell me which parts you check first when debugging a production memory issue.",
      q1Source: "JVM memory model · Knowledge entry #204",
      a1: "Heap and metaspace matter most. I check the heap allocation rate and GC logs first, then compare metaspace and thread-stack growth.",
      q2: "You covered generational collection but not the pause versus throughput trade-off between CMS and G1. Explain why your team chose G1.",
      q2Gap: "Missing point: CMS vs G1 pause / throughput trade-off",
      a2: "Our service runs an 8 GB heap and is latency sensitive, so G1's pause target and predictable mixed GC made us migrate from CMS.",
    },
  },
  dynamic: {
    followUp: "You mentioned \"{{keyword}}\" — walk me through the trade-off and the metrics behind it.",
    followUpNoKeyword: "Got it. Can you add one concrete, quantified example?",
  },
  session: {
    title: "Session info",
    caption: "Resume and JD are locked for this session",
    rows: {
      role: "Role",
      roleValue: "Java Backend Engineer",
      resume: "Resume version",
      resumeValue: "Resume v3 · Frozen",
      jd: "Target JD",
      jdValue: "Backend hiring JD · Trading platform",
      scale: "Scale version",
      scaleValue: "Competency scale v1.0",
      elapsed: "Elapsed",
      elapsedValue: "18 minutes",
    },
  },
  voice: {
    title: "Voice pipeline",
    caption: "Dual channel with automatic fallback",
    rows: {
      asr: "ASR available",
      asrDetail: "Live transcription, reviewable line by line after answering",
      tts: "TTS available",
      ttsDetail: "Interviewer voice playback, pausable anytime",
      fallback: "Text-only fallback",
      fallbackDetail: "Keeps full context and the follow-up chain when voice is unavailable",
    },
  },
  gaps: {
    title: "Follow-up basis",
    caption: "Gaps flagged automatically from the current answer",
    items: {
      gcTradeoff: "CMS vs G1 pause / throughput trade-off",
      offHeap: "Impact of off-heap memory and metaspace on GC",
      quantify: "Metrics for tuning gains (P99 / throughput)",
    },
  },
  composer: {
    placeholder: "Type your answer, or hold the mic to answer by voice",
    mic: "Answer by voice",
    voiceSend: "Voice answer",
    send: "Send",
  },
}
