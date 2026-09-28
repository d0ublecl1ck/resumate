import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { MascotNote } from "./mascot-note"
import { Stage } from "./story-frame"

export default { title: "Brand/MascotNote", parameters: { layout: "centered" } }

function Hint() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotNote className="w-[26rem]">{t("brand.state.empty.description")}</MascotNote>
    </Stage>
  )
}

export const Default = { render: () => <Hint /> }

function ToneRow() {
  const { t } = useTranslation()
  return (
    <Stage direction="column">
      <MascotNote tone="praise" className="w-[26rem]">
        {t("common.saveState.committed")}
      </MascotNote>
      <MascotNote tone="warn" className="w-[26rem]">
        {t("common.saveState.failed")}
      </MascotNote>
      <MascotNote tone="ask" className="w-[26rem]">
        {t("common.pendingAction.pending")}
      </MascotNote>
    </Stage>
  )
}

export const Tones = { render: () => <ToneRow /> }

function PoseRow() {
  const { t } = useTranslation()
  return (
    <Stage direction="column">
      <MascotNote pose="wave" className="w-[26rem]">
        {t("brand.state.empty.description")}
      </MascotNote>
      <MascotNote pose="hero" tone="ask" className="w-[26rem]">
        {t("brand.state.loading.description")}
      </MascotNote>
    </Stage>
  )
}

export const Poses = { render: () => <PoseRow /> }

function VolumeRow() {
  const { t } = useTranslation()
  return (
    <Stage direction="column">
      <MascotNote mascot="full" className="w-[26rem]">
        {t("brand.state.empty.description")}
      </MascotNote>
      <MascotNote mascot="badge" className="w-[26rem]">
        {t("brand.state.empty.description")}
      </MascotNote>
      <MascotNote mascot="none" className="w-[26rem]">
        {t("brand.state.empty.description")}
      </MascotNote>
    </Stage>
  )
}

export const Volume = { render: () => <VolumeRow /> }

function EndTail() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotNote tail="end" tone="praise" className="w-[26rem]">
        {t("common.actions.done")}
      </MascotNote>
    </Stage>
  )
}

export const TailEnd = { render: () => <EndTail /> }

function Pending() {
  return (
    <Stage>
      <MascotNote pending className="w-[26rem]" />
    </Stage>
  )
}

export const Thinking = { render: () => <Pending /> }

function NoteWithAction() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotNote
        tone="ask"
        className="w-[30rem]"
        action={
          <>
            <Button variant="outline" size="sm">
              {t("common.actions.reject")}
            </Button>
            <Button size="sm">{t("common.actions.approve")}</Button>
          </>
        }
      >
        {t("common.pendingAction.textConfirmPrompt", { word: t("common.pendingAction.textConfirmWord") })}
      </MascotNote>
    </Stage>
  )
}

export const WithAction = { render: () => <NoteWithAction /> }

function NoteBoundary() {
  const { t } = useTranslation()
  return (
    <Stage direction="column">
      <MascotNote tone="warn" className="w-56">
        {t("common.errors.network")}
      </MascotNote>
      <MascotNote className="w-[20rem]">
        {t("brand.state.error.description")} {t("brand.state.error.description")} {t("brand.state.error.description")}
      </MascotNote>
    </Stage>
  )
}

export const Boundary = { render: () => <NoteBoundary /> }
