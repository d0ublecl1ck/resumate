import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { StateBlock } from "./state-block"

export default { title: "Kit/StateBlock", parameters: { layout: "centered" } }

const KINDS = ["empty", "loading", "error", "conflict", "forbidden", "frozen"] as const

function AllKinds() {
  const { t } = useTranslation()
  return (
    <div className="grid gap-6 bg-background p-8 lg:grid-cols-2">
      {KINDS.map((kind) => (
        <StateBlock
          key={kind}
          kind={kind}
          title={t(`brand.state.${kind}.title`)}
          description={t(`brand.state.${kind}.description`)}
          className="w-[30rem]"
        />
      ))}
    </div>
  )
}

export const Default = { render: () => <AllKinds /> }

function WithErrorCode() {
  const { t } = useTranslation()
  return (
    <div className="bg-background p-8">
      <StateBlock
        kind="error"
        title={t("common.pageState.notFound", { target: t("common.entities.resume") })}
        description={t("common.pageState.notFoundDescription")}
        errorCode="RESUME_NOT_FOUND"
        action={<Button variant="outline" size="sm">{t("common.actions.backToWorkbench")}</Button>}
        className="w-[30rem]"
      />
    </div>
  )
}

export const WithErrorCode_ = { name: "With error code", render: () => <WithErrorCode /> }
