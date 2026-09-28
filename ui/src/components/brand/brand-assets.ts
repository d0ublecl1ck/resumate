// 品牌资产路径的唯一映射，供标志、对话气泡与品牌空态共用。
export const BRAND_MARK_SRC = "/brand/mark.png"

export const MASCOT_POSE_SRC = {
  hero: "/brand/mascot.png",
  wave: "/brand/mascot-wave.png",
} as const

export type MascotPose = keyof typeof MASCOT_POSE_SRC
