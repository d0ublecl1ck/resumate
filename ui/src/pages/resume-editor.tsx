// SCR-003 简历编辑工作台（Page）。

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

  if (resumeQuery.isPending) return <PageLoading />
  if (!resume) return <PageNotFound entity="resume" />
  if (runQuery.isPending || templateQuery.isPending || jdsQuery.isPending) return <PageLoading />

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
