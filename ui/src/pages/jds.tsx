// SCR-005 JD 库（Page）。

import { useQuery } from "@tanstack/react-query"
import { listJds, listResumes } from "@/lib/api"
import { JdLibrary } from "@/components/jd-library"
import { PageLoading } from "@/pages/states"

export function JdsPage() {
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => listJds() })
  const active = useQuery({ queryKey: ["resumes", "active"], queryFn: () => listResumes({ lifecycle: "active" }) })
  const archived = useQuery({ queryKey: ["resumes", "archived"], queryFn: () => listResumes({ lifecycle: "archived" }) })

  if (jds.isPending || active.isPending || archived.isPending) return <PageLoading />

  return <JdLibrary jds={jds.data ?? []} resumes={[...(active.data ?? []), ...(archived.data ?? [])]} />
}
