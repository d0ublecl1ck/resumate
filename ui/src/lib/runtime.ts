// 运行体就绪信号（契约 §20.5）：profile-assistant 与 settings-form 共用同一 query，
// 避免同一份数据被两处各请求一次；后续新增消费者也必须走这个 hook。

import { useQuery } from "@tanstack/react-query"

import { getRuntimeStatus } from "@/lib/api"

export const RUNTIME_STATUS_QUERY_KEY = ["runtime-status"] as const

export function useRuntimeStatus(enabled = true) {
  return useQuery({
    queryKey: RUNTIME_STATUS_QUERY_KEY,
    queryFn: getRuntimeStatus,
    staleTime: 30_000,
    enabled,
  })
}
