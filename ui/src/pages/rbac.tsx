// SCR-113 角色与权限管理。
// 角色可在线维护；权限码由代码静态声明，因此权限目录以「按资源分组的权限树」只读展示。
// 角色编辑弹窗用同一棵树做三态勾选（开源 headless 组件 @headless-tree/react）。

import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { TreeInstance } from "@headless-tree/core"
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from "@/lib/api"
import type { Permission, Role, RoleInput, RoleUpdateInput } from "@/lib/types"
import { PermissionTree } from "@/components/permission-tree"
import { checkedPermissionCodes, type PermissionTreeNode } from "@/lib/permission-tree"
import { PageHeader } from "@/components/kit/toolbar"
import { PageLoading } from "@/pages/states"
import { cn } from "@/lib/utils"
import { Pencil, Plus, Trash2, X } from "lucide-react"

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
const ACTION_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40"

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function RbacPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const roles = useQuery({ queryKey: ["rbac", "roles"], queryFn: listRoles })
  const permissions = useQuery({ queryKey: ["rbac", "permissions"], queryFn: listPermissions })
  const [roleDraft, setRoleDraft] = useState<Role | "new" | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] })
    void queryClient.invalidateQueries({ queryKey: ["rbac", "permissions"] })
  }

  const removeRole = useMutation({ mutationFn: deleteRole, onSuccess: refresh })

  if (roles.isPending || permissions.isPending) return <PageLoading />

  const roleList = roles.data ?? []
  const permissionList = permissions.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t("rbac.title")} description={t("rbac.description")} />

      <section className="card-soft p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("rbac.roles.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("rbac.roles.hint")}</p>
          </div>
          <button onClick={() => setRoleDraft("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("rbac.roles.create")}
          </button>
        </div>
        <ul className="space-y-2">
          {roleList.map((role) => (
            <li key={role.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  {role.name}
                  <span className="font-mono text-xs text-muted-foreground">{role.code}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", role.isSystem ? "bg-secondary text-secondary-foreground" : "bg-cobalt/10 text-cobalt")}>
                    {role.isSystem ? t("rbac.roles.system") : t("rbac.roles.custom")}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("rbac.roles.count", { count: role.permissions.length })}</p>
              </div>
              <div className="flex items-center gap-2">
                <button disabled={role.isSystem} onClick={() => setRoleDraft(role)} className={ACTION_CLASS}>
                  <Pencil className="size-3.5" aria-hidden /> {t("rbac.actions.edit")}
                </button>
                <button disabled={role.isSystem} onClick={() => removeRole.mutate(role.id)} className={cn(ACTION_CLASS, "border-coral/40 text-coral hover:bg-coral/5")}>
                  <Trash2 className="size-3.5" aria-hidden /> {t("rbac.actions.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {removeRole.isError ? <p className="mt-2 text-xs text-coral">{errorMessage(removeRole.error, t("rbac.errors.actionFailed"))}</p> : null}
      </section>

      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("rbac.permissions.title")}</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">{t("rbac.permissions.hint")}</p>
        <PermissionTree permissions={permissionList} />
      </section>

      {roleDraft ? (
        <RoleDialog
          key={roleDraft === "new" ? "new" : roleDraft.id}
          role={roleDraft}
          permissions={permissionList}
          onClose={() => setRoleDraft(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("rbac.actions.close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("rbac.actions.close")}>
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RoleDialog({ role, permissions, onClose, onSaved }: { role: Role | "new"; permissions: Permission[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const isNew = role === "new"
  const [code, setCode] = useState(isNew ? "" : role.code)
  const [name, setName] = useState(isNew ? "" : role.name)
  const [description, setDescription] = useState(isNew ? "" : role.description)
  const [selected] = useState<string[]>(isNew ? [] : role.permissions)
  const treeRef = useRef<TreeInstance<PermissionTreeNode> | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const chosen = treeRef.current ? checkedPermissionCodes(treeRef.current) : selected
      if (isNew) {
        const input: RoleInput = { code: code.trim(), name: name.trim(), description: description.trim(), permissions: chosen }
        return createRole(input)
      }
      const patch: RoleUpdateInput = { name: name.trim(), description: description.trim(), permissions: chosen }
      return updateRole(role.id, patch)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  return (
    <Dialog title={isNew ? t("rbac.roles.create") : t("rbac.actions.edit")} onClose={onClose}>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.code")}</span>
        <input className={INPUT_CLASS} value={code} disabled={!isNew} onChange={(event) => setCode(event.target.value)} />
        {isNew ? <span className="mt-1 block text-[11px] text-muted-foreground">{t("rbac.hints.roleCode")}</span> : null}
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.name")}</span>
        <input className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.description")}</span>
        <input className={INPUT_CLASS} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("rbac.fields.permissions")}</p>
        <PermissionTree permissions={permissions} checkedCodes={selected} checkable onTreeReady={(tree) => { treeRef.current = tree }} />
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {mutation.isError ? <span className="text-xs text-coral">{errorMessage(mutation.error, t("rbac.errors.actionFailed"))}</span> : null}
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
          {t("rbac.actions.cancel")}
        </button>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || name.trim().length === 0 || (isNew && code.trim().length === 0)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {mutation.isPending ? t("rbac.state.saving") : isNew ? t("rbac.actions.create") : t("rbac.actions.save")}
        </button>
      </div>
    </Dialog>
  )
}
