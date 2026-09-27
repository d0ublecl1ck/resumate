// SCR-007 版本历史与比较（Page）。

import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getResume } from "@/lib/api"
import { VersionHistory } from "@/components/version-history"
import { PageLoading, PageNotFound } from "@/pages/states"

export function ResumeVersionsPage() {
  const { id = "" } = useParams()
  const { data: resume, isPending } = useQuery({ queryKey: ["resume", id], queryFn: () => getResume(id) })

  if (isPending) return <PageLoading />
  if (!resume) return <PageNotFound entity="resume" />

  return <VersionHistory resume={resume} />
}
