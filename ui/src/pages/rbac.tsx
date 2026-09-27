// SCR-113 角色与权限管理：在线维护 RBAC 角色与权限目录。
// 系统内置项只读，自定义项可增删改；编码创建后不可修改。

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  listPermissions,
  listRoles,
  updatePermission,
  updateRole,
} from "@/lib/api"
import type { Permission, PermissionInput, PermissionUpdateInput, Role, RoleInput, RoleUpdateInput } from "@/lib/types"
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
  const [permissionDraft, setPermissionDraft] = useState<Permission | "new" | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] })
    void queryClient.invalidateQueries({ queryKey: ["rbac", "permissions"] })
  }

  const removeRole = useMutation({ mutationFn: deleteRole, onSuccess: refresh })
  const removePermission = useMutation({ mutationFn: deletePermission, onSuccess: refresh })

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
                  <ScopeBadge isSystem={role.isSystem} systemLabel={t("rbac.roles.system")} customLabel={t("rbac.roles.custom")} />
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
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("rbac.permissions.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("rbac.permissions.hint")}</p>
          </div>
          <button onClick={() => setPermissionDraft("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("rbac.permissions.create")}
          </button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {permissionList.map((permission) => (
            <li key={permission.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{permission.name}</p>
                <p className="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  {permission.code}
                  <ScopeBadge isSystem={permission.isSystem} systemLabel={t("rbac.permissions.system")} customLabel={t("rbac.permissions.custom")} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button disabled={permission.isSystem} onClick={() => setPermissionDraft(permission)} className={ACTION_CLASS} aria-label={t("rbac.actions.edit")}>
                  <Pencil className="size-3.5" aria-hidden />
                </button>
                <button disabled={permission.isSystem} onClick={() => removePermission.mutate(permission.id)} className={cn(ACTION_CLASS, "border-coral/40 text-coral hover:bg-coral/5")} aria-label={t("rbac.actions.delete")}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {removePermission.isError ? <p className="mt-2 text-xs text-coral">{errorMessage(removePermission.error, t("rbac.errors.actionFailed"))}</p> : null}
      </section>

      {roleDraft ? (
        <RoleDialog role={roleDraft} permissions={permissionList} onClose={() => setRoleDraft(null)} onSaved={refresh} />
      ) : null}
      {permissionDraft ? (
        <PermissionDialog permission={permissionDraft} onClose={() => setPermissionDraft(null)} onSaved={refresh} />
      ) : null}
    </div>
  )
}

function ScopeBadge({ isSystem, systemLabel, customLabel }: { isSystem: boolean; systemLabel: string; customLabel: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", isSystem ? "bg-secondary text-secondary-foreground" : "bg-cobalt/10 text-cobalt")}>
      {isSystem ? systemLabel : customLabel}
    </span>
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
  const [selected, setSelected] = useState<string[]>(isNew ? [] : role.permissions)

  const mutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        const input: RoleInput = { code: code.trim(), name: name.trim(), description: description.trim(), permissions: selected }
        return createRole(input)
      }
      const patch: RoleUpdateInput = { name: name.trim(), description: description.trim(), permissions: selected }
      return updateRole(role.id, patch)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  function toggle(permissionCode: string) {
    setSelected((items) => (items.includes(permissionCode) ? items.filter((item) => item !== permissionCode) : [...items, permissionCode]))
  }

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
        <p className="text-xs font-medium text-muted-foreground">{t("rbac.fields.permissions")}</p>
        <ul className="mt-2 grid max-h-64 gap-1.5 overflow-auto sm:grid-cols-2">
          {permissions.map((permission) => (
            <li key={permission.id}>
              <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                <input type="checkbox" checked={selected.includes(permission.code)} onChange={() => toggle(permission.code)} />
                <span className="font-mono">{permission.code}</span>
              </label>
            </li>
          ))}
        </ul>
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

function PermissionDialog({ permission, onClose, onSaved }: { permission: Permission | "new"; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const isNew = permission === "new"
  const [code, setCode] = useState(isNew ? "" : permission.code)
  const [group, setGroup] = useState(isNew ? "" : permission.group)
  const [name, setName] = useState(isNew ? "" : permission.name)

  const mutation = useMutation({
    mutationFn: () => {
      if (isNew) {
        const input: PermissionInput = { code: code.trim(), group: group.trim(), name: name.trim() }
        return createPermission(input)
      }
      const patch: PermissionUpdateInput = { group: group.trim(), name: name.trim() }
      return updatePermission(permission.id, patch)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  return (
    <Dialog title={isNew ? t("rbac.permissions.create") : t("rbac.actions.edit")} onClose={onClose}>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.code")}</span>
        <input className={INPUT_CLASS} value={code} disabled={!isNew} onChange={(event) => setCode(event.target.value)} />
        {isNew ? <span className="mt-1 block text-[11px] text-muted-foreground">{t("rbac.hints.permissionCode")}</span> : null}
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.group")}</span>
        <input className={INPUT_CLASS} value={group} onChange={(event) => setGroup(event.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-muted-foreground">{t("rbac.fields.name")}</span>
        <input className={INPUT_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
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
