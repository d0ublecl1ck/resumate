// SCR-009 模板编辑与校验（管理员，Page）。

import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { getTemplate } from "@/lib/api"
import { TemplateEditor } from "@/components/template-editor"
import { PageLoading, PageNotFound } from "@/pages/states"

export function TemplateEditorPage() {
  const { id = "" } = useParams()
  const { data: template, isPending } = useQuery({ queryKey: ["template", id], queryFn: () => getTemplate(id) })

  if (isPending) return <PageLoading />
  if (!template) return <PageNotFound target="模板" />

  return <TemplateEditor template={template} />
}
