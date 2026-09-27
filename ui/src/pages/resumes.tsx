// SCR-002 简历库（Page）。

import { useQuery } from "@tanstack/react-query"
import { listJds, listResumes, listTemplates } from "@/lib/api"
import { ResumeLibrary } from "@/components/resume-library"
import { PageLoading } from "@/pages/states"

export function ResumesPage() {
  const active = useQuery({ queryKey: ["resumes", "active"], queryFn: () => listResumes({ lifecycle: "active" }) })
  const archived = useQuery({ queryKey: ["resumes", "archived"], queryFn: () => listResumes({ lifecycle: "archived" }) })
  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates })
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => listJds() })

  if (active.isPending || archived.isPending || templates.isPending || jds.isPending) return <PageLoading />

  return (
    <ResumeLibrary
      resumes={[...(active.data ?? []), ...(archived.data ?? [])]}
      templates={templates.data ?? []}
      jds={jds.data ?? []}
    />
  )
}
