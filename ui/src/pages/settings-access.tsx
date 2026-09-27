// SCR-011 开放接入与访问审计（Page）。

import { useQuery } from "@tanstack/react-query"
import { getCapability, listAccessLogs, listPats } from "@/lib/api"
import { AccessPanel } from "@/components/access-panel"
import { PageLoading } from "@/pages/states"

export function AccessPage() {
  const pats = useQuery({ queryKey: ["pats"], queryFn: listPats })
  const logs = useQuery({ queryKey: ["access-logs"], queryFn: listAccessLogs })
  const capability = useQuery({ queryKey: ["capability"], queryFn: getCapability })

  if (pats.isPending || logs.isPending || capability.isPending) return <PageLoading />

  return <AccessPanel pats={pats.data!} logs={logs.data!} capability={capability.data!} />
}
