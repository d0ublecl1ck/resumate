// 路由级加载 / 未找到状态。与 DES-012 统一状态块保持同一套视觉与文案约束。

import { Link } from "react-router-dom"
import { StateBlock } from "@/components/kit/state-block"

export function PageLoading({ label = "正在读取本地演示数据…" }: { label?: string }) {
  return <StateBlock kind="loading" title="加载中" description={label} />
}

export function PageNotFound({ target = "资源" }: { target?: string }) {
  return (
    <StateBlock
      kind="error"
      title={`未找到该${target}`}
      description="它可能已被删除或从未存在。"
      errorCode="404"
      action={
        <Link to="/" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          返回工作台
        </Link>
      }
    />
  )
}
