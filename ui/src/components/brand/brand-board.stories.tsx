import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { BrandLockup } from "./brand-mark"
import { MascotNote } from "./mascot-note"
import { MascotState } from "./mascot-state"
import { StampBadge } from "./stamp-badge"
import { StickerCard } from "./sticker-card"

export default { title: "Brand/Board", parameters: { layout: "fullscreen" } }

function Board() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-background px-6 py-8 sm:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BrandLockup />
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("nav.brand.tagline")}</span>
        </div>
        <div className="flex items-center gap-2">
          <StampBadge tone="cobalt">{t("common.saveState.committed")}</StampBadge>
          <StickerCard interactive tone="gold" className="rounded-full px-5 py-2">
            <span className="text-sm font-black">{t("common.actions.save")}</span>
          </StickerCard>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <StickerCard lift="md" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-serif text-lg font-bold">{t("nav.items.workbench")}</p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{t("brand.state.loading.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StampBadge tone="cobalt">{t("common.evidence.verified")}</StampBadge>
              <StampBadge tone="gold">{t("common.binding.reselected")}</StampBadge>
            </div>
          </div>
          <div aria-hidden className="space-y-2">
            <div className="h-3 w-4/5 rounded-full bg-secondary" />
            <div className="h-3 w-3/5 rounded-full bg-secondary" />
            <div className="h-3 w-11/12 rounded-full bg-secondary" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              {t("common.actions.editAndAccept")}
            </Button>
            <Button size="sm">{t("common.actions.accept")}</Button>
          </div>
        </StickerCard>

        <div className="space-y-6">
          <MascotNote tone="hint" action={<Button size="sm">{t("common.actions.create")}</Button>}>
            {t("brand.state.empty.description")}
          </MascotNote>
          <StickerCard tone="cobalt" lift="lg" className="space-y-2">
            <p className="font-serif text-base font-black">{t("common.actions.create")}</p>
            <p className="text-sm text-pretty opacity-80">{t("brand.state.frozen.description")}</p>
          </StickerCard>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <MascotState
          kind="empty"
          action={<Button size="sm">{t("common.actions.create")}</Button>}
        />
        <MascotState
          kind="error"
          errorCode="RESUME_NOT_FOUND"
          action={
            <Button variant="outline" size="sm">
              {t("common.actions.backToWorkbench")}
            </Button>
          }
        />
      </div>
    </div>
  )
}

export const Default = { render: () => <Board /> }
