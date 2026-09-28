// 吉祥物姿态 → 库内资产的唯一映射，供对话气泡与品牌空态共用。
export const MASCOT_POSE_SRC = {
  hero: "/brand/mascot.png",
  wave: "/brand/mascot-wave.png",
} as const

export type MascotPose = keyof typeof MASCOT_POSE_SRC
