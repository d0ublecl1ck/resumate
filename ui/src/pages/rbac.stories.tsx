// SCR-113 RBAC 管理页的 Storybook 预览。
// 演示数据不是界面文案，用 i18n-allow 豁免 ui-i18n 门禁；查询数据预置在 QueryClient，story 不发网络请求。

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RbacPage } from "./rbac"
import type { Permission, Role } from "@/lib/types"

const SYSTEM_PERMISSIONS: Permission[] = [
  { id: "perm_resume_read", code: "resume:read", group: "resume", name: "读取简历" }, // i18n-allow: Storybook 演示数据
  { id: "perm_resume_write", code: "resume:write", group: "resume", name: "编辑简历" }, // i18n-allow: Storybook 演示数据
  { id: "perm_user_read", code: "user:read", group: "user", name: "读取用户列表" }, // i18n-allow: Storybook 演示数据
  { id: "perm_role_write", code: "role:write", group: "role", name: "维护角色" }, // i18n-allow: Storybook 演示数据
]

const SYSTEM_ROLES: Role[] = [
  { id: "role_user", code: "user", name: "普通用户", description: "", rank: 1, isSystem: true, permissions: ["resume:read"] }, // i18n-allow: Storybook 演示数据
  { id: "role_admin", code: "admin", name: "管理员", description: "", rank: 2, isSystem: true, permissions: ["resume:read", "user:read"] }, // i18n-allow: Storybook 演示数据
  { id: "role_super_admin", code: "super_admin", name: "超级管理员", description: "", rank: 3, isSystem: true, permissions: ["resume:read", "resume:write", "user:read", "role:write"] }, // i18n-allow: Storybook 演示数据
]

const CUSTOM_ROLE: Role = { id: "role_reviewer", code: "reviewer", name: "审核员", description: "只读审核", rank: 0, isSystem: false, permissions: ["resume:read", "resume:write"] } // i18n-allow: Storybook 演示数据

function Fixture({ roles, permissions }: { roles: Role[]; permissions: Permission[] }) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(["rbac", "roles"], roles)
    queryClient.setQueryData(["rbac", "permissions"], permissions)
    return queryClient
  })
  return (
    <QueryClientProvider client={client}>
      <div className="mx-auto w-full max-w-5xl p-8">
        <RbacPage />
      </div>
    </QueryClientProvider>
  )
}

export default {
  title: "Pages/RBAC",
  parameters: { layout: "fullscreen" },
}

export const Default = {
  render: () => <Fixture roles={SYSTEM_ROLES} permissions={SYSTEM_PERMISSIONS} />,
}

export const WithCustomEntries = {
  render: () => <Fixture roles={[...SYSTEM_ROLES, CUSTOM_ROLE]} permissions={SYSTEM_PERMISSIONS} />,
}
