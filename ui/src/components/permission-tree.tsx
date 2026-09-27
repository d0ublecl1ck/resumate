// 权限树：按资源分组展示权限目录，可选三态勾选（用于角色权限编辑）。
// 基于开源 headless 组件 @headless-tree/react（+ @headless-tree/core），本身不带样式，这里用项目 Tailwind 令牌渲染。

import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useTree } from "@headless-tree/react"
import {
  checkboxesFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type TreeInstance,
} from "@headless-tree/core"
import {
  PERMISSION_TREE_GROUP_PREFIX as GROUP_PREFIX,
  PERMISSION_TREE_ROOT_ID as ROOT_ID,
  type PermissionTreeNode,
} from "@/lib/permission-tree"
import type { Permission } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

export function PermissionTree({
  permissions,
  checkedCodes = [],
  checkable = false,
  disabled = false,
  onTreeReady,
}: {
  permissions: Permission[]
  checkedCodes?: string[]
  checkable?: boolean
  /** 只读展示勾选状态（例如系统内置角色）：仍然显示复选框，但不可修改。 */
  disabled?: boolean
  onTreeReady?: (tree: TreeInstance<PermissionTreeNode>) => void
}) {
  const { t } = useTranslation()

  const groups = useMemo(() => Array.from(new Set(permissions.map((item) => item.group))).sort(), [permissions])
  const byCode = useMemo(() => new Map(permissions.map((item) => [item.code, item])), [permissions])

  const dataLoader = useMemo(
    () => ({
      getItem: (id: string): PermissionTreeNode => {
        if (id === ROOT_ID) return { label: "" }
        if (id.startsWith(GROUP_PREFIX)) {
          const group = id.slice(GROUP_PREFIX.length)
          return { label: t("rbac.group." + group, { defaultValue: group }) }
        }
        const permission = byCode.get(id)
        return { label: permission ? t("rbac.permission." + permission.code, { defaultValue: permission.name }) : id }
      },
      getChildren: (id: string): string[] => {
        if (id === ROOT_ID) return groups.map((group) => GROUP_PREFIX + group)
        if (id.startsWith(GROUP_PREFIX)) {
          const group = id.slice(GROUP_PREFIX.length)
          return permissions.filter((item) => item.group === group).map((item) => item.code)
        }
        return []
      },
    }),
    [byCode, groups, permissions, t],
  )

  const tree = useTree<PermissionTreeNode>({
    rootItemId: ROOT_ID,
    dataLoader,
    initialState: {
      expandedItems: groups.map((group) => GROUP_PREFIX + group),
      checkedItems: checkedCodes,
    },
    features: checkable
      ? [syncDataLoaderFeature, selectionFeature, checkboxesFeature, expandAllFeature, hotkeysCoreFeature]
      : [syncDataLoaderFeature, expandAllFeature, hotkeysCoreFeature],
    canCheckFolders: true,
    propagateCheckedState: true,
    isItemFolder: (item) => item.getKey() === ROOT_ID || item.getKey().startsWith(GROUP_PREFIX),
    getItemName: (item) => item.getItemData().label,
  })

  useEffect(() => {
    onTreeReady?.(tree)
  }, [onTreeReady, tree])

  return (
    <ul {...tree.getContainerProps(t("rbac.tree.label"))} className="max-h-72 overflow-auto rounded-md border border-border bg-card p-1.5 text-sm">
      {tree
        .getItems()
        .filter((item) => item.getKey() !== ROOT_ID)
        .map((item) => (
          <li
            key={item.getKey()}
            {...item.getProps()}
            style={{ paddingLeft: Math.max(0, item.getItemMeta().level - 1) * 16 + 4 }}
            className="flex items-center gap-1.5 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            {checkable ? <input type="checkbox" {...item.getCheckboxProps()} disabled={disabled} className="size-3.5 accent-cobalt disabled:opacity-60" /> : null}
            <span className="truncate text-foreground">{item.getItemName()}</span>
            {item.isFolder() ? null : <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{item.getKey()}</span>}
          </li>
        ))}
    </ul>
  )
}
