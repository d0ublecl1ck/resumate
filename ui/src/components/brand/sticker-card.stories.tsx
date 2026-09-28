import { useTranslation } from "react-i18next"

import { StampBadge } from "./stamp-badge"
import { StickerCard } from "./sticker-card"
import type { StickerLift, StickerTone } from "./sticker-card"
import { Stage } from "./story-frame"

export default { title: "Brand/StickerCard", parameters: { layout: "centered" } }

const TONE_ROWS: { tone: StickerTone; stampKey: string }[] = [
  { tone: "paper", stampKey: "common.saveState.committed" },
  { tone: "cobalt", stampKey: "common.saveState.saving" },
  { tone: "coral", stampKey: "common.saveState.failed" },
  { tone: "gold", stampKey: "common.binding.reselected" },
]

const LIFTS: StickerLift[] = ["none", "sm", "md", "lg"]

function CardBody({ stampKey }: { stampKey: string }) {
  const { t } = useTranslation()
  return (
    <>
      <p className="font-serif text-base font-bold">{t("nav.items.resumes")}</p>
      <p className="mt-1 text-sm text-pretty opacity-80">{t("brand.state.empty.description")}</p>
      <div className="mt-3">
        <StampBadge tone="neutral">{t(stampKey)}</StampBadge>
      </div>
    </>
  )
}

function ToneGrid() {
  return (
    <Stage>
      {TONE_ROWS.map(({ tone, stampKey }) => (
        <StickerCard key={tone} tone={tone} className="w-60">
          <CardBody stampKey={stampKey} />
        </StickerCard>
      ))}
    </Stage>
  )
}

export const Tones = { render: () => <ToneGrid /> }

function LiftRow() {
  return (
    <Stage>
      {LIFTS.map((lift) => (
        <StickerCard key={lift} lift={lift} className="w-48">
          <p className="font-mono text-xs">{lift}</p>
        </StickerCard>
      ))}
    </Stage>
  )
}

export const Lifts = { render: () => <LiftRow /> }

function TiltRow() {
  return (
    <Stage>
      <StickerCard tilt={-2} className="w-48">
        <p className="font-mono text-xs">-2</p>
      </StickerCard>
      <StickerCard tilt={1.5} lift="md" className="w-48">
        <p className="font-mono text-xs">1.5</p>
      </StickerCard>
      <StickerCard tilt={0} className="w-48">
        <p className="font-mono text-xs">0</p>
      </StickerCard>
    </Stage>
  )
}

export const Tilted = { render: () => <TiltRow /> }

function InteractiveRow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <StickerCard interactive tone="gold" className="w-56">
        <span className="text-sm font-black">{t("common.actions.save")}</span>
      </StickerCard>
      <StickerCard interactive onClick={() => undefined} lift="lg" className="w-64">
        <CardBody stampKey="common.saveState.committed" />
      </StickerCard>
    </Stage>
  )
}

export const Interactive = { render: () => <InteractiveRow /> }

function DisabledRow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <StickerCard interactive disabled className="w-56">
        <span className="text-sm font-black">{t("common.actions.save")}</span>
      </StickerCard>
      <StickerCard interactive disabled tone="cobalt" className="w-56">
        <CardBody stampKey="common.saveState.saving" />
      </StickerCard>
    </Stage>
  )
}

export const Disabled = { render: () => <DisabledRow /> }

function BoundaryRow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <StickerCard className="w-52">
        <p className="font-mono text-xs break-all">resumate_brand_token_0123456789abcdef0123456789abcdef</p>
      </StickerCard>
      <StickerCard className="w-72">
        <p className="text-sm text-pretty">
          {t("brand.state.frozen.description")} {t("brand.state.frozen.description")}
        </p>
      </StickerCard>
      <StickerCard className="w-40">
        <p className="text-xs">{t("common.saveState.frozen")}</p>
      </StickerCard>
    </Stage>
  )
}

export const Boundary = { render: () => <BoundaryRow /> }
