// SCR-011 开放接入与访问审计（Page）：读取真实 PAT/日志/能力发现，变更后就地刷新。

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCapability, listAccessLogs, listPats } from "@/lib/api"
import { AccessPanel } from "@/components/access-panel"
import { PageLoading } from "@/pages/states"

export function AccessPage() {
  const queryClient = useQueryClient()
  const pats = useQuery({ queryKey: ["pats"], queryFn: listPats })
  const logs = useQuery({ queryKey: ["access-logs"], queryFn: listAccessLogs })
  const capability = useQuery({ queryKey: ["capability"], queryFn: getCapability })

  if (pats.isPending || logs.isPending || capability.isPending) return <PageLoading />

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pats"] })
    void queryClient.invalidateQueries({ queryKey: ["access-logs"] })
  }

  return <AccessPanel pats={pats.data!} logs={logs.data!} capability={capability.data!} onChanged={refresh} />
}
