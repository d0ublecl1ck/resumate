// 角色树：系统内置 / 自定义两个分组，点击角色项通过 onPrimaryAction 回传选中。
// 同样基于 @headless-tree/react，样式由项目 Tailwind 令牌渲染。

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useTree } from "@headless-tree/react"
import { expandAllFeature, hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core"
import type { Role } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

const ROOT_ID = "root"
const GROUP_SYSTEM = "group:system"
const GROUP_CUSTOM = "group:custom"
const ROLE_PREFIX = "role:"

interface RoleTreeNode {
  label: string
}

export function RoleTree({ roles, selectedId, onSelect }: { roles: Role[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const byId = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const systemRoles = useMemo(() => roles.filter((role) => role.isSystem), [roles])
  const customRoles = useMemo(() => roles.filter((role) => !role.isSystem), [roles])

  const dataLoader = useMemo(
    () => ({
      getItem: (id: string): RoleTreeNode => {
        if (id === ROOT_ID) return { label: "" }
        if (id === GROUP_SYSTEM) return { label: t("rbac.roles.system") }
        if (id === GROUP_CUSTOM) return { label: t("rbac.roles.custom") }
        const role = byId.get(id.slice(ROLE_PREFIX.length))
        return { label: role ? role.name : id }
      },
      getChildren: (id: string): string[] => {
        if (id === ROOT_ID) return [GROUP_SYSTEM, GROUP_CUSTOM]
        if (id === GROUP_SYSTEM) return systemRoles.map((role) => ROLE_PREFIX + role.id)
        if (id === GROUP_CUSTOM) return customRoles.map((role) => ROLE_PREFIX + role.id)
        return []
      },
    }),
    [byId, customRoles, systemRoles, t],
  )

  const tree = useTree<RoleTreeNode>({
    rootItemId: ROOT_ID,
    dataLoader,
    initialState: { expandedItems: [GROUP_SYSTEM, GROUP_CUSTOM] },
    features: [syncDataLoaderFeature, expandAllFeature, hotkeysCoreFeature],
    isItemFolder: (item) => item.getKey() === ROOT_ID || item.getKey() === GROUP_SYSTEM || item.getKey() === GROUP_CUSTOM,
    getItemName: (item) => item.getItemData().label,
    onPrimaryAction: (item) => {
      if (item.getKey().startsWith(ROLE_PREFIX)) onSelect(item.getKey().slice(ROLE_PREFIX.length))
    },
  })

  return (
    <ul {...tree.getContainerProps(t("rbac.tree.roleLabel"))} className="max-h-[28rem] overflow-auto rounded-md border border-border bg-card p-1.5 text-sm">
      {tree
        .getItems()
        .filter((item) => item.getKey() !== ROOT_ID)
        .map((item) => {
          const roleId = item.getKey().startsWith(ROLE_PREFIX) ? item.getKey().slice(ROLE_PREFIX.length) : null
          const role = roleId ? byId.get(roleId) : undefined
          const selected = roleId !== null && roleId === selectedId
          return (
            <li
              key={item.getKey()}
              {...item.getProps()}
              aria-selected={selected || undefined}
              style={{ paddingLeft: Math.max(0, item.getItemMeta().level - 1) * 16 + 4 }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                selected && "bg-secondary",
              )}
            >
              {item.isFolder() ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (item.isExpanded()) item.collapse()
                    else item.expand()
                  }}
                  aria-label={item.isExpanded() ? t("rbac.tree.collapse") : t("rbac.tree.expand")}
                  className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", item.isExpanded() && "rotate-90")} aria-hidden />
                </button>
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}
              <span className={cn("truncate", selected ? "font-semibold text-foreground" : "text-foreground")}>{item.getItemName()}</span>
              {role ? <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{role.code}</span> : null}
            </li>
          )
        })}
    </ul>
  )
}
