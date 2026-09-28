import { useTranslation } from "react-i18next"

import { BrandLockup, BrandMark } from "./brand-mark"
import { Stage } from "./story-frame"

export default { title: "Brand/BrandMark", parameters: { layout: "centered" } }

export const Sizes = {
  render: () => (
    <Stage>
      <BrandMark size="sm" />
      <BrandMark size="md" />
      <BrandMark size="lg" />
    </Stage>
  ),
}

function LabelledMark() {
  const { t } = useTranslation()
  return (
    <Stage>
      <BrandMark size="lg" label={t("brand.markAlt")} />
    </Stage>
  )
}

export const AccessibleName = { render: () => <LabelledMark /> }

export const Lockup = {
  render: () => (
    <Stage>
      <BrandLockup />
      <BrandLockup size="lg" />
    </Stage>
  ),
}

export const LockupVertical = {
  render: () => (
    <Stage>
      <BrandLockup size="lg" orientation="vertical" />
    </Stage>
  ),
}

export const OnDark = {
  render: () => (
    <div className="dark bg-background">
      <Stage>
        <BrandLockup />
        <BrandLockup size="lg" />
      </Stage>
    </div>
  ),
}
