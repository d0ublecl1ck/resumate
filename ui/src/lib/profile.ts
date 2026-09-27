// Profile 事实的展示文案：直接编辑表单与对话卡片共用同一套标签，避免两条路径说法不一致。

import type { EvidenceStatus, FactType, FactVisibility } from "@/lib/types"

export const FACT_TYPE_LABEL: Record<FactType, string> = {
  experience: "经历",
  project: "项目",
  skill: "技能",
  education: "教育",
  achievement: "成果",
  certificate: "证书",
}

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  verified: "已核实",
  unverified: "待核实",
  no_evidence: "无证据",
}

export const FACT_VISIBILITY_LABEL: Record<FactVisibility, string> = {
  private: "私有（仅自己可见）",
  resume_only: "仅用于简历",
  public: "可对已授权客户端公开",
}

export const FACT_TYPE_ORDER: FactType[] = ["experience", "project", "skill", "education", "achievement", "certificate"]
