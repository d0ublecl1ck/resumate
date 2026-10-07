// SCR-011 开放接入与访问审计（Page）：读取真实 PAT/日志/能力发现，变更后就地刷新。
// 按 access:read 决定是否渲染面板与是否请求日志；按 access:write 决定写入口是否可用（c3825）。
// 筛选变更重置到第 1 页；日志分页与筛选通过 query key 管理。

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { getCapability, listAccessLogs, listPats } from "@/lib/api"
import { AccessPanel, type AccessLogFilters } from "@/components/access-panel"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"
import { useCurrentUser } from "@/lib/session"

const PAGE_SIZE = 20
const EMPTY_FILTERS: AccessLogFilters = { purpose: "", result: "", query: "" }
const RETRY_CLASS = "rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"

export function AccessPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  const canRead = user.data?.permissions.includes("access:read") ?? false
  const canWrite = user.data?.permissions.includes("access:write") ?? false
  const [filters, setFilters] = useState<AccessLogFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const pats = useQuery({ queryKey: ["pats"], queryFn: listPats, enabled: canRead })
  const logs = useQuery({
    queryKey: ["access-logs", page, filters.purpose, filters.result, filters.query],
    queryFn: () =>
      listAccessLogs({
        page,
        size: PAGE_SIZE,
        purpose: filters.purpose || undefined,
        result: filters.result || undefined,
        q: filters.query || undefined,
      }),
    enabled: canRead,
  })
  const capability = useQuery({ queryKey: ["capability"], queryFn: getCapability })

  function changeFilters(patch: Partial<AccessLogFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
    // 筛选变更回到第 1 页，避免停留在筛选后的越界页码。
    setPage(1)
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pats"] })
    void queryClient.invalidateQueries({ queryKey: ["access-logs"] })
  }

  if (user.isPending) return <PageLoading />

  if (!canRead) {
    return <StateBlock kind="forbidden" title={t("settings.access.forbidden.title")} description={t("settings.access.forbidden.description")} />
  }

  if (pats.isPending || capability.isPending) return <PageLoading />

  if (pats.isError || capability.isError) {
    return (
      <StateBlock
        kind="error"
        title={t("settings.access.loadError.title")}
        description={t("settings.access.loadError.description")}
        action={
          <button type="button" className={RETRY_CLASS} onClick={refresh}>
            {t("common.actions.retry")}
          </button>
        }
      />
    )
  }

  const logsState = logs.isPending ? "loading" : logs.isError ? "error" : "ready"

  return (
    <AccessPanel
      pats={pats.data!}
      logs={logs.data?.items ?? []}
      logsState={logsState}
      capability={capability.data!}
      canWrite={canWrite}
      filters={filters}
      onFiltersChange={changeFilters}
      page={page}
      pageSize={PAGE_SIZE}
      total={logs.data?.total ?? null}
      onPageChange={setPage}
      onChanged={refresh}
    />
  )
}
