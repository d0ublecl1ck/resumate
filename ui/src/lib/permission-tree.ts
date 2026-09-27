// 权限树的纯逻辑：节点 id 约定与从树状态取回被勾选的权限码。
// 与渲染分离，便于组件文件满足 react-refresh 的「只导出组件」约束。

import type { TreeInstance } from "@headless-tree/core"

export const PERMISSION_TREE_ROOT_ID = "root"
export const PERMISSION_TREE_GROUP_PREFIX = "group:"

export interface PermissionTreeNode {
  label: string
}

/** 从树上取回被勾选的权限码（过滤掉分组节点）。 */
export function checkedPermissionCodes(tree: TreeInstance<PermissionTreeNode>): string[] {
  return tree
    .getState()
    .checkedItems.filter((id) => id !== PERMISSION_TREE_ROOT_ID && !id.startsWith(PERMISSION_TREE_GROUP_PREFIX))
}
