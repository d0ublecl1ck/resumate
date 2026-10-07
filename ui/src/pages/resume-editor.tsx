// SCR-003 简历编辑工作台（Page）。

import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { getActiveRun, getResume, getTemplate, listJds } from "@/lib/api"
import { ResumeEditor } from "@/components/resume-editor"
import { PageLoading, PageNotFound } from "@/pages/states"

export function ResumeEditorPage() {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const [searchParams] = useSearchParams()

  const resumeQuery = useQuery({ queryKey: ["resume", id], queryFn: () => getResume(id) })
  const resume = resumeQuery.data
  const ready = Boolean(resume)

  const runQuery = useQuery({ queryKey: ["active-run", id], queryFn: () => getActiveRun(id), enabled: ready })
  const templateQuery = useQuery({
    queryKey: ["template", resume?.templateId],
    queryFn: () => getTemplate(resume?.templateId ?? ""),
    enabled: ready,
  })
  const jdsQuery = useQuery({ queryKey: ["jds"], queryFn: () => listJds(), enabled: ready })

  // 首屏 gate：一次后台刷新（invalidate / 聚焦 refetch / reset）可能让查询短暂回到 pending，
  // 只有首屏才允许整页 <PageLoading />。否则会卸载 RunPanel，丢掉输入草稿与 SSE 订阅；
  // 后续刷新由各区块自己兜底，RunPanel 也能渲染「没有 run」。
  const pending = resumeQuery.isPending || runQuery.isPending || templateQuery.isPending || jdsQuery.isPending
  const firstLoadRef = useRef(true)
  useEffect(() => {
    if (!pending) firstLoadRef.current = false
  }, [pending])

  if (resumeQuery.isPending) return <PageLoading />
  if (!resume) return <PageNotFound entity="resume" />
  if (firstLoadRef.current && pending) return <PageLoading />

  const boundJds = (jdsQuery.data ?? []).filter((j) => resume.boundByJdIds.includes(j.id))

  return (
    <ResumeEditor
      resume={resume}
      run={runQuery.data}
      templateName={templateQuery.data?.name ?? t("resume.editor.defaultTemplate")}
      boundJds={boundJds}
      initialColumn={searchParams.get("panel") === "run" ? "chat" : "edit"}
    />
  )
}
