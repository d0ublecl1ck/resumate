// 设置分区布局：页头 + 分区导航 + 子路由出口。

import { Outlet } from "react-router-dom"
import { SettingsNav } from "@/components/settings-nav"
import { PageHeader } from "@/components/kit/toolbar"

export function SettingsLayout() {
  return (
    <div className="space-y-6">
      <PageHeader title="设置与开放接入" description="管理 Agent 运行模式、模型凭证、个人偏好、访问令牌与数据备份。" />
      <SettingsNav />
      <Outlet />
    </div>
  )
}
