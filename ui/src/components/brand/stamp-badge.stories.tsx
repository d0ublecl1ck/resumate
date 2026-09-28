import { useTranslation } from "react-i18next"

import { StampBadge } from "./stamp-badge"
import type { StampTone } from "./stamp-badge"
import { Stage } from "./story-frame"

export default { title: "Brand/StampBadge", parameters: { layout: "centered" } }

const TONES: StampTone[] = ["neutral", "cobalt", "coral", "gold"]

function ToneRow() {
  const { t } = useTranslation()
  const labels = [t("common.saveState.committed"), t("common.binding.bound"), t("common.saveState.failed"), t("common.binding.reselected")]
  return (
    <Stage>
      {TONES.map((tone, index) => (
        <StampBadge key={tone} tone={tone}>
          {labels[index]}
        </StampBadge>
      ))}
    </Stage>
  )
}

export const Tones = { render: () => <ToneRow /> }

function StraightRow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <StampBadge tilt={0}>{t("common.evidence.verified")}</StampBadge>
      <StampBadge tilt={3}>{t("common.evidence.unverified")}</StampBadge>
      <StampBadge tilt={-6}>{t("common.evidence.no_evidence")}</StampBadge>
    </Stage>
  )
}

export const Tilt = { render: () => <StraightRow /> }

function BoundaryRow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <StampBadge tone="coral">
        {t("common.binding.unavailable")} · {t("nav.items.settings")} · {t("common.provenance.external_client")}
      </StampBadge>
    </Stage>
  )
}

export const Boundary = { render: () => <BoundaryRow /> }
