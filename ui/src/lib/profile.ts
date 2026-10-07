// Profile 事实的展示文案：直接编辑表单与对话卡片共用同一套标签，避免两条路径说法不一致。
// 文案存放在 i18n 的 profile 命名空间，调用方传入 useTranslation() 的 t。

import type { TFunction } from "i18next"
import type { EvidenceStatus, FactType, FactVisibility } from "@/lib/types"

// 事实类型的唯一顺序来源：分区展示（profile-workspace 的 SECTIONS）与类型下拉都从这里取序，
// 避免「下拉顺序」与「分区顺序」两处各写一遍后漂移。
export const FACT_TYPE_ORDER: FactType[] = ["experience", "project", "education", "skill", "achievement", "certificate"]

export function factTypeLabel(t: TFunction, type: FactType): string {
  return t(`profile.factType.${type}`)
}

export function evidenceStatusLabel(t: TFunction, status: EvidenceStatus): string {
  return t(`profile.evidenceStatus.${status}`)
}

export function factVisibilityLabel(t: TFunction, visibility: FactVisibility): string {
  return t(`profile.factVisibility.${visibility}`)
}
