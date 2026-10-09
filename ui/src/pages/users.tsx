// SCR-114 用户管理（Page）：真实读取 GET /auth/users，封禁/解封与角色调整走后端。
// 仅 user:read 可见；写操作分别按 user:ban / user:unban / role:assign 权限与「不能操作自己」控制。
// 封禁原因走 react-hook-form + zodResolver；所有错误按机器码映射到 i18n，不直出服务端 message。

import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { banUser, changeUserRole, listRoles, listUsers, unbanUser } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import type { AdminUser } from "@/lib/types"
import { useCurrentUser } from "@/lib/session"
import { PageHeader } from "@/components/kit/toolbar"
import { Modal } from "@/components/ui/modal"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"
import { cn } from "@/lib/utils"
import { Ban, CheckCircle2, ShieldCheck, UserCheck } from "lucide-react"

const BUTTON_CLASS = "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"

/** 机器错误码 -> i18n 键；调用方再交给 t()，绝不回显服务端 message。 */
function errorKey(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RESOURCE_NOT_FOUND") return "users.errors.missing"
    if (cause.code === "FORBIDDEN") return "users.errors.forbidden"
    if (cause.code === "VALIDATION_FAILED") return "users.errors.validation"
    if (cause.code === "NETWORK_ERROR") return "users.errors.network"
  }
  return "users.errors.generic"
}

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const me = currentUser.data
  const canRead = me?.permissions.includes("user:read") ?? false
  const canBan = me?.permissions.includes("user:ban") ?? false
  const canUnban = me?.permissions.includes("user:unban") ?? false
  const canAssign = me?.permissions.includes("role:assign") ?? false

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers, enabled: canRead })
  const rolesQuery = useQuery({ queryKey: ["rbac", "roles"], queryFn: listRoles, enabled: canAssign })
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  }

  if (currentUser.isPending) return <PageLoading />
  if (!canRead) return <StateBlock kind="forbidden" title={t("users.forbidden.title")} description={t("users.forbidden.description")} />
  if (usersQuery.isPending) return <PageLoading />
  if (usersQuery.isError) {
    return (
      <StateBlock
        kind="error"
        title={t("users.loadError.title")}
        description={t("users.loadError.description")}
        action={
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary" onClick={() => void usersQuery.refetch()}>
            {t("common.actions.retry")}
          </button>
        }
      />
    )
  }

  const users = usersQuery.data ?? []
  const roles = rolesQuery.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t("users.title")} description={t("users.description")} />
      <section className="card-soft overflow-x-auto p-5">
        {users.length === 0 ? (
          <StateBlock kind="empty" title={t("users.empty.title")} description={t("users.empty.description")} />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("users.columns.user")}</th>
                <th className="py-2 pr-4 font-medium">{t("users.columns.roles")}</th>
                <th className="py-2 pr-4 font-medium">{t("users.columns.status")}</th>
                <th className="py-2 pr-4 font-medium">{t("users.columns.createdAt")}</th>
                <th className="py-2 font-medium">{t("users.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roles={roles}
                  isSelf={user.id === me?.id}
                  canBan={canBan}
                  canUnban={canUnban}
                  canAssign={canAssign}
                  onBan={() => setBanTarget(user)}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {banTarget ? (
        <BanUserDialog
          target={banTarget}
          onOpenChange={(open) => {
            if (!open) setBanTarget(null)
          }}
          onBanned={() => {
            setBanTarget(null)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function UserRow({
  user,
  roles,
  isSelf,
  canBan,
  canUnban,
  canAssign,
  onBan,
  onChanged,
}: {
  user: AdminUser
  roles: { code: string; name: string }[]
  isSelf: boolean
  canBan: boolean
  canUnban: boolean
  canAssign: boolean
  onBan: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const separator = t("common.listSeparator")
  const [role, setRole] = useState(user.role)
  const roleName = (code: string) => roles.find((item) => item.code === code)?.name ?? code

  const roleMutation = useMutation({
    mutationFn: (next: string) => changeUserRole(user.id, next),
    onSuccess: (updated) => {
      setRole(updated.role)
      onChanged()
    },
  })
  const unbanMutation = useMutation({
    mutationFn: () => unbanUser(user.id),
    onSuccess: () => onChanged(),
  })

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="py-3 pr-4">
        <p className="font-medium text-foreground">{user.displayName}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        {isSelf ? <span className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{t("users.self")}</span> : null}
      </td>
      <td className="py-3 pr-4">
        {canAssign && !isSelf && roles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`role-${user.id}`}>
              {t("users.role.label")}
            </label>
            <select
              id={`role-${user.id}`}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {roles.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
              {!roles.some((item) => item.code === role) ? <option value={role}>{role}</option> : null}
            </select>
            <button
              type="button"
              disabled={roleMutation.isPending || role === user.role}
              onClick={() => roleMutation.mutate(role)}
              className={cn(BUTTON_CLASS, "border-border text-foreground hover:bg-secondary")}
            >
              <ShieldCheck className="size-3.5" aria-hidden /> {roleMutation.isPending ? t("users.role.saving") : t("users.role.save")}
            </button>
            {roleMutation.isSuccess ? (
              <span className="inline-flex items-center gap-1 text-xs text-cobalt">
                <CheckCircle2 className="size-3.5" aria-hidden /> {t("users.role.saved")}
              </span>
            ) : null}
            {roleMutation.isError ? <span className="text-xs text-coral">{t(errorKey(roleMutation.error))}</span> : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{user.roles.length ? user.roles.map(roleName).join(separator) : t("users.role.none")}</span>
        )}
        {!canAssign ? <span className="mt-1 block text-[11px] text-muted-foreground">{t("users.role.noPermission")}</span> : null}
      </td>
      <td className="py-3 pr-4">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            user.isBanned ? "border-coral/40 bg-coral/5 text-coral" : "border-border bg-muted text-muted-foreground",
          )}
        >
          {user.isBanned ? t("users.status.banned") : t("users.status.active")}
        </span>
      </td>
      <td className="py-3 pr-4 text-xs text-muted-foreground">{user.createdAt.slice(0, 10)}</td>
      <td className="py-3">
        {user.isBanned ? (
          <button
            type="button"
            disabled={!canUnban || isSelf || unbanMutation.isPending}
            onClick={() => unbanMutation.mutate()}
            className={cn(BUTTON_CLASS, "border-border text-foreground hover:bg-secondary")}
          >
            <UserCheck className="size-3.5" aria-hidden /> {unbanMutation.isPending ? t("users.unban.pending") : t("users.unban.action")}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canBan || isSelf || roleMutation.isPending}
            onClick={onBan}
            className={cn(BUTTON_CLASS, "border-coral/40 text-coral hover:bg-coral/5")}
          >
            <Ban className="size-3.5" aria-hidden /> {t("users.ban.action")}
          </button>
        )}
        {unbanMutation.isError ? <span className="ml-2 text-xs text-coral">{t(errorKey(unbanMutation.error))}</span> : null}
      </td>
    </tr>
  )
}

function BanUserDialog({
  target,
  onOpenChange,
  onBanned,
}: {
  target: AdminUser
  onOpenChange: (open: boolean) => void
  onBanned: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => z.object({ reason: z.string().max(500, t("users.errors.validation")).optional() }), [t])
  const { register, handleSubmit, formState } = useForm<{ reason?: string }>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  })
  const mutation = useMutation({
    mutationFn: (values: { reason?: string }) => banUser(target.id, values.reason),
    onSuccess: () => onBanned(),
  })
  // 表单字段错误来自 zod 文案；先取出再渲染，避免与 API 错误透传门禁的正则混淆。
  const reasonError = formState.errors.reason?.message

  return (
    <Modal open onOpenChange={onOpenChange} title={t("users.ban.title")} description={t("users.ban.description", { name: target.displayName })}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="mt-4">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("users.ban.reason")}</span>
          <textarea rows={3} placeholder={t("users.ban.reasonPlaceholder")} className={INPUT_CLASS} {...register("reason")} />
        </label>
        {reasonError ? (
          <p role="alert" className="mt-1 text-xs text-coral">
            {reasonError}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="mt-2 text-xs text-coral">
            {t(errorKey(mutation.error))}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
            {t("common.actions.cancel")}
          </button>
          <button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {mutation.isPending ? t("users.ban.banning") : t("users.ban.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  )
}
