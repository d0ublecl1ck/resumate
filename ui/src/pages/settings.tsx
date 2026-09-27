// SCR-010 设置与 Agent 运行配置（Page）。

import { useQuery } from "@tanstack/react-query"
import { getAgentConfig, getModelConfig, getPreferences, listTemplates } from "@/lib/api"
import { SettingsForm } from "@/components/settings-form"
import { PageLoading } from "@/pages/states"

export function SettingsPage() {
  const agent = useQuery({ queryKey: ["agent-config"], queryFn: getAgentConfig })
  const model = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig })
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: getPreferences })
  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates })

  if (agent.isPending || model.isPending || prefs.isPending || templates.isPending) return <PageLoading />

  return <SettingsForm agent={agent.data!} model={model.data!} prefs={prefs.data!} templates={templates.data!} />
}
