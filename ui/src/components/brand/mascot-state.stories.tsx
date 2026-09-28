import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { MascotState } from "./mascot-state"
import { Stage } from "./story-frame"

export default { title: "Brand/MascotState", parameters: { layout: "centered" } }

function Grid() {
  return (
    <div className="grid gap-6 bg-background p-8 lg:grid-cols-2">
      <MascotState kind="empty" />
      <MascotState kind="loading" />
      <MascotState kind="error" />
      <MascotState kind="forbidden" />
      <MascotState kind="frozen" />
    </div>
  )
}

export const AllKinds = { render: () => <Grid /> }

export const Empty = {
  render: () => (
    <Stage>
      <MascotState kind="empty" className="w-[30rem]" />
    </Stage>
  ),
}

export const Loading = {
  render: () => (
    <Stage>
      <MascotState kind="loading" className="w-[30rem]" />
    </Stage>
  ),
}

function SizeRow() {
  return (
    <Stage direction="column">
      <MascotState kind="empty" size="quiet" className="w-[30rem]" />
      <MascotState kind="empty" size="default" className="w-[30rem]" />
      <MascotState kind="empty" size="hero" className="w-[30rem]" />
    </Stage>
  )
}

export const Sizes = { render: () => <SizeRow /> }

function StateErrorWithCode() {
  return (
    <Stage>
      <MascotState kind="error" errorCode="RESUME_NOT_FOUND" className="w-[30rem]" />
    </Stage>
  )
}

export const ErrorWithCode = { render: () => <StateErrorWithCode /> }

function StateWithAction() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotState
        kind="forbidden"
        action={
          <Button variant="outline" size="sm">
            {t("common.actions.close")}
          </Button>
        }
        className="w-[30rem]"
      />
    </Stage>
  )
}

export const WithAction = { render: () => <StateWithAction /> }

function StateCustomCopy() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotState
        kind="empty"
        title={t("nav.items.resumes")}
        description={t("brand.state.empty.description")}
        className="w-[30rem]"
      />
    </Stage>
  )
}

export const CustomCopy = { render: () => <StateCustomCopy /> }

function StateNarrow() {
  const { t } = useTranslation()
  return (
    <Stage>
      <MascotState kind="error" description={t("common.errors.network")} className="w-72" />
    </Stage>
  )
}

export const Narrow = { render: () => <StateNarrow /> }
