import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

import { MascotNote } from "./mascot-note"
import { MascotState } from "./mascot-state"
import { StampBadge } from "./stamp-badge"
import { StickerCard } from "./sticker-card"

export default { title: "Brand/Mix", parameters: { layout: "fullscreen" } }

// 音量阶梯：同一屏内容在四档品牌密度下的样子，用来决定"并入现有页面会不会突兀"。
type Volume = "plain" | "grammar" | "badge" | "character"

const VOLUMES: Volume[] = ["plain", "grammar", "badge", "character"]

function Panel({ volume, children }: { volume: Volume; children: React.ReactNode }) {
  if (volume === "plain") {
    return <div className="rounded-lg border border-border bg-card p-4">{children}</div>
  }
  return (
    <StickerCard lift="sm" className="p-4">
      {children}
    </StickerCard>
  )
}

function Stub({ volume }: { volume: Volume }) {
  const { t } = useTranslation()
  if (volume === "plain") {
    return <p className="text-sm text-muted-foreground">{t("brand.state.empty.title")}</p>
  }
  if (volume === "grammar") {
    return (
      <p className="rounded-2xl border-2 border-dashed border-foreground/25 px-4 py-4 text-sm text-muted-foreground">
        {t("brand.state.empty.title")}
      </p>
    )
  }
  return <MascotState kind="empty" size={volume === "badge" ? "quiet" : "default"} />
}

function Column({ volume }: { volume: Volume }) {
  const { t } = useTranslation()
  const rows = [t("nav.items.resumes"), t("nav.items.jds"), t("nav.items.profile")]

  return (
    <section className="space-y-3">
      <p className="font-mono text-xs tracking-wide text-muted-foreground">{t(`brand.volume.${volume}`)}</p>

      <Panel volume={volume}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-serif text-base font-bold">{t("nav.items.workbench")}</span>
          {volume === "plain" ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              {t("common.saveState.committed")}
            </span>
          ) : (
            <StampBadge tone="cobalt">{t("common.saveState.committed")}</StampBadge>
          )}
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row}
              className={
                volume === "plain"
                  ? "rounded-md border border-border px-3 py-2 text-sm"
                  : "rounded-xl border-2 border-foreground/15 px-3 py-2 text-sm font-medium"
              }
            >
              {row}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel volume={volume}>
        <Stub volume={volume} />
      </Panel>

      {volume === "plain" || volume === "grammar" ? null : (
        <MascotNote mascot={volume === "badge" ? "badge" : "full"}>
          {t("brand.state.empty.description")}
        </MascotNote>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={volume === "plain" ? "outline" : "default"}
          size="sm"
        >
          {t("common.actions.create")}
        </Button>
      </div>
    </section>
  )
}

function MixBoard() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="grid items-start gap-8 lg:grid-cols-2 xl:grid-cols-4">
        {VOLUMES.map((volume) => (
          <Column key={volume} volume={volume} />
        ))}
      </div>
    </div>
  )
}

export const Default = { render: () => <MixBoard /> }
