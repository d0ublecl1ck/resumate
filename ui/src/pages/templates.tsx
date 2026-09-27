// SCR-008 模板库（管理员，Page）。

import { useQuery } from "@tanstack/react-query"
import { listTemplates } from "@/lib/api"
import { TemplateLibrary } from "@/components/template-library"
import { PageLoading } from "@/pages/states"

export function TemplatesPage() {
  const { data: templates, isPending } = useQuery({ queryKey: ["templates"], queryFn: listTemplates })

  if (isPending || !templates) return <PageLoading />

  return <TemplateLibrary templates={templates} />
}
