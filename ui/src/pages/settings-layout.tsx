// 设置分区布局：页头 + 分区导航 + 常驻 tab 面板。
// 分区面板一旦访问过就保持挂载，切换 tab 只切换可见性（对照 ui/prototypes/index.html 的 .tabpanel[hidden]），
// 避免卸载正在编辑的表单——SettingsForm 的本地草稿会随组件卸载丢失。

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import { SettingsNav } from "@/components/settings-nav"
import { PageHeader } from "@/components/kit/toolbar"
import { SettingsPage } from "@/pages/settings"
import { AccessPage } from "@/pages/settings-access"
import { BackupPage } from "@/pages/settings-backup"
import { NotFoundPage } from "@/pages/not-found"

const PANELS = [
  { tab: "", Panel: SettingsPage },
  { tab: "access", Panel: AccessPage },
  { tab: "backup", Panel: BackupPage },
]

/** 路由 splat 归一化为面板 tab：`/settings` → `""`，`/settings/access/` → `"access"`。 */
function normalizeTab(splat: string | undefined) {
  return (splat ?? "").replace(/^\/+|\/+$/g, "")
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const { "*": splat } = useParams()
  const active = normalizeTab(splat)
  const known = PANELS.some((panel) => panel.tab === active)

  // 记录已访问过的分区：离开后仍保留其实例，切回来时未保存的草稿还在。
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    setVisited((prev) => (prev.includes(active) ? prev : [...prev, active]))
  }, [active])

  if (!known) return <NotFoundPage />

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.layout.title")} description={t("settings.layout.description")} />
      <SettingsNav />
      {PANELS.map(({ tab, Panel }) => {
        const visible = tab === active
        // 当前分区立即挂载；已经访问过的分区保持挂载，只隐藏不卸载。
        if (!visible && !visited.includes(tab)) return null
        return (
          <div key={tab || "index"} hidden={!visible}>
            <Panel />
          </div>
        )
      })}
    </div>
  )
}
