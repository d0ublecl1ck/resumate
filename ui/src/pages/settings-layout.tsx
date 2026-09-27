// 设置分区布局：页头 + 分区导航 + 子路由出口。

import { useTranslation } from "react-i18next"
import { Outlet } from "react-router-dom"
import { SettingsNav } from "@/components/settings-nav"
import { PageHeader } from "@/components/kit/toolbar"

export function SettingsLayout() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.layout.title")} description={t("settings.layout.description")} />
      <SettingsNav />
      <Outlet />
    </div>
  )
}
