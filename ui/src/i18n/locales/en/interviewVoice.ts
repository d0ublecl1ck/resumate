// Copy for the voice interview (Interview/Voice) screen.
export default {
  meta: {
    eyebrow: "Voice interview",
    title: "Listen, answer, verify the transcript",
    description: "Questions are spoken with TTS, and answers can be recorded and transcribed live. When the voice channel is down, the context and follow-up chain are kept and the screen falls back to text.",
  },
  header: {
    outageSwitch: "Simulate voice service outage",
    outageBadge: "Fell back to text answers",
    channelReady: "Voice channel ready",
  },
  conversation: {
    title: "Conversation",
    caption: "TTS playback + transcript verification",
    interviewer: "Interviewer",
    candidate: "Me",
    channelVoice: "Voice answer",
    channelText: "Text answer",
    verified: "Transcript verified",
  },
  question: {
    label: "Current question",
    play: "Play question (TTS)",
    playing: "Playing…",
    hint: "Spoken by the interviewer · stops after about 3 seconds",
    reListen: "Replay as often as you need before answering",
  },
  turns: {
    q1: "Start with one API performance optimization you led, covering the context, what you did, and the final numbers.",
    a1: "Order creation P99 dropped from 800ms to 220ms while QPS rose from 600 to 1800.",
    q2: "You said you collapsed per-row lookups into batch queries. Walk me through how you located and refactored it, and how you verified the gain.",
  },
  answer: {
    title: "My answer",
    caption: "Answer by voice; falls back to text when the voice service is down",
    notGranted: {
      title: "Microphone permission required",
      body: "Once granted, audio is transcribed locally only. Raw recordings are never uploaded or written into this session.",
      allow: "Allow microphone access",
      privacy: "You can revoke access in the browser at any time",
    },
    ready: {
      hold: "Hold to talk",
      hint: "Click to start recording, then finish to generate the transcript",
      recording: "Recording",
      stop: "Stop recording",
    },
    transcribe: {
      title: "Transcript (editable)",
      hint: "Not scored until verified",
      sample: "The order API used to fetch products one row at a time in a loop. I switched to a single batch query plus a local cache, cutting SQL calls from 120 to 3 and bringing P99 down to 220ms.",
      confirm: "Verified",
    },
    confirmed: {
      badge: "Confirmed answer",
      rerecord: "Record again",
    },
    degraded: {
      banner: "Voice channel unavailable. Fallen back to text answers; the existing context and follow-up chain are preserved.",
      placeholder: "Type your answer…",
      send: "Send",
    },
  },
  panel: {
    voice: {
      title: "Voice pipeline status",
      caption: "Follows the outage switch in the header",
      available: "Available",
      unavailable: "Unavailable",
      asr: "ASR live transcription",
      asrDetail: "Transcribes while recording; written to this turn after verification",
      asrDownDetail: "Transcription is off; use the text input instead",
      tts: "TTS question playback",
      ttsDetail: "Speaks each question; can be stopped at any time",
      ttsDownDetail: "Playback is off; questions are shown as text only",
    },
    session: {
      title: "Session info",
      caption: "Résumé and JD are frozen for this session",
      role: "Role",
      roleValue: "Java Backend Engineer",
      scale: "Rubric version",
      scaleValue: "Competency rubric v1.0",
      elapsed: "Elapsed",
      elapsedValue: "18 min",
    },
    gaps: {
      title: "Follow-up basis",
      caption: "Open points flagged from the current answer",
      items: {
        sqlCount: "SQL count and latency before vs. after the batch refactor",
        cacheConsistency: "Consistency plan between local cache and database (invalidation order)",
        metricScope: "Measurement basis for the gain (P99 and QPS sampling window)",
      },
    },
  },
}
