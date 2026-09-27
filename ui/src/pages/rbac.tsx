// SCR-113 角色与权限管理（经典左树右表两栏）。
// 左侧角色树（系统内置 / 自定义）；右侧为选中角色的详情 + 权限树勾选。
// 权限码由代码静态声明，目录只读；角色可在线维护。

import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { TreeInstance } from "@headless-tree/core"
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from "@/lib/api"
import type { Permission, Role, RoleInput, RoleUpdateInput } from "@/lib/types"
import { PermissionTree } from "@/components/permission-tree"
import { RoleTree } from "@/components/role-tree"
import { checkedPermissionCodes, type PermissionTreeNode } from "@/lib/permission-tree"
import { PageHeader } from "@/components/kit/toolbar"
import { PageLoading } from "@/pages/states"
import { cn } from "@/lib/utils"
import { Plus, Trash2 } from "lucide-react"

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
const PRIMARY_BUTTON = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
const GHOST_BUTTON = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function RbacPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryKey: ["rbac", "roles"], queryFn: listRoles })
  const permissionsQuery = useQuery({ queryKey: ["rbac", "permissions"], queryFn: listPermissions })
  // null = 未显式选择，渲染期回退到列表首个角色，避免在 effect 里 setState。
  const [selection, setSelection] = useState<Role | "new" | null>(null)
  const roleList = rolesQuery.data ?? []
  const permissionList = permissionsQuery.data ?? []

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] })
    void queryClient.invalidateQueries({ queryKey: ["rbac", "permissions"] })
  }

  if (rolesQuery.isPending || permissionsQuery.isPending) return <PageLoading />

  const draft: Role | "new" | null = selection ?? roleList[0] ?? null
  const selectedId = draft && draft !== "new" ? draft.id : null

  return (
    <div className="space-y-6">
      <PageHeader title={t("rbac.title")} description={t("rbac.description")} />

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="card-soft p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">{t("rbac.roles.title")}</h2>
            <button onClick={() => setSelection("new")} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="size-3.5" aria-hidden /> {t("rbac.roles.create")}
            </button>
          </div>
          <RoleTree roles={roleList} selectedId={selectedId} onSelect={(id) => setSelection(roleList.find((role) => role.id === id) ?? null)} />
        </section>

        <section className="card-soft p-5">
          {draft ? (
            <RoleDetail
              key={draft === "new" ? "new" : draft.id}
              role={draft}
              permissions={permissionList}
              onSaved={(saved) => {
                refresh()
                setSelection(saved)
              }}
              onDeleted={() => {
                refresh()
                setSelection(null)
              }}
              onCancel={() => setSelection(null)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("rbac.detail.empty")}</p>
          )}
        </section>
      </div>
    </div>
  )
}

function RoleDetail({
  role,
  permissions,
  onSaved,
  onDeleted,
  onCancel,
}: {
  role: Role | "new"
  permissions: Permission[]
  onSaved: (role: Role) => void
  onDeleted: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const isNew = role === "new"
  const isSystem = !isNew && role.isSystem
  const [code, setCode] = useState(isNew ? "" : role.code)
  const [name, setName] = useState(isNew ? "" : role.name)
  const [description, setDescription] = useState(isNew ? "" : role.description)
  const treeRef = useRef<TreeInstance<PermissionTreeNode> | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const chosen = treeRef.current ? checkedPermissionCodes(treeRef.current) : isNew ? [] : role.permissions
      if (isNew) {
        const input: RoleInput = { code: code.trim(), name: name.trim(), description: description.trim(), permissions: chosen }
        return createRole(input)
      }
      const patch: RoleUpdateInput = { name: name.trim(), description: description.trim(), permissions: chosen }
      return updateRole(role.id, patch)
    },
    onSuccess: (data) => onSaved(data),
  })

  const remove = useMutation({
    mutationFn: () => deleteRole(isNew ? "" : role.id),
    onSuccess: () => onDeleted(),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{isNew ? t("rbac.roles.create") : role.name}</h2>
          {!isNew ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{role.code}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", role.isSystem ? "bg-secondary text-secondary-foreground" : "bg-cobalt/10 text-cobalt")}>
                {role.isSystem ? t("rbac.roles.system") : t("rbac.roles.custom")}
              </span>
              <span>{t("rbac.roles.count", { count: role.permissions.length })}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && !isSystem ? (
            <button onClick={() => remove.mutate()} disabled={remove.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-coral/40 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/5 disabled:opacity-60">
              <Trash2 className="size-4" aria-hidden /> {t("rbac.actions.delete")}
            </button>
          ) : null}
          {isNew ? (
            <button onClick={onCancel} className={GHOST_BUTTON}>
              {t("rbac.actions.cancel")}
            </button>
          ) : null}
          {!isSystem ? (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || name.trim().length === 0 || (isNew && code.trim().length === 0)}
              className={PRIMARY_BUTTON}
            >
              {save.isPending ? t("rbac.state.saving") : isNew ? t("rbac.actions.create") : t("rbac.actions.save")}
            </button>
          ) : null}
        </div>
      </div>

      {isSystem ? <p className="rounded-md border border-cobalt/30 bg-cobalt/5 px-3 py-2 text-xs text-cobalt">{t("rbac.detail.systemReadonly")}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.code")}</span>
          <input className={INPUT_CLASS} value={code} disabled={!isNew || isSystem} onChange={(event) => setCode(event.target.value)} />
          {isNew ? <span className="mt-1 block text-[11px] text-muted-foreground">{t("rbac.hints.roleCode")}</span> : null}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.name")}</span>
          <input className={INPUT_CLASS} value={name} disabled={isSystem} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.description")}</span>
          <input className={INPUT_CLASS} value={description} disabled={isSystem} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("rbac.fields.permissions")}</p>
        <PermissionTree
          permissions={permissions}
          checkedCodes={isNew ? [] : role.permissions}
          checkable
          disabled={isSystem}
          onTreeReady={(tree) => {
            treeRef.current = tree
          }}
        />
      </div>

      {save.isError || remove.isError ? (
        <p className="text-xs text-coral">{errorMessage(save.error ?? remove.error, t("rbac.errors.actionFailed"))}</p>
      ) : null}
    </div>
  )
}
