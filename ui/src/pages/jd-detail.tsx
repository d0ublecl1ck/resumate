// SCR-006 JD 详情与岗位微调（Page）。

import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getJd, listResumes } from "@/lib/api"
import { JdTuning } from "@/components/jd-tuning"
import { PageLoading, PageNotFound } from "@/pages/states"

export function JdDetailPage() {
  const { id = "" } = useParams()
  const jd = useQuery({ queryKey: ["jd", id], queryFn: () => getJd(id) })
  const active = useQuery({ queryKey: ["resumes", "active"], queryFn: () => listResumes({ lifecycle: "active" }) })
  const archived = useQuery({ queryKey: ["resumes", "archived"], queryFn: () => listResumes({ lifecycle: "archived" }) })

  if (jd.isPending || active.isPending || archived.isPending) return <PageLoading />
  if (!jd.data) return <PageNotFound entity="jd" />

  return <JdTuning jd={jd.data} resumes={[...(active.data ?? []), ...(archived.data ?? [])]} />
}
