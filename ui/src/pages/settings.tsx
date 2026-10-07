// SCR-010 设置与 Agent 运行配置（Page）。
// 四个初始查询任一失败都走统一错误状态块（错误码 + 重试），
// 不再把 undefined 交给 SettingsForm 强断言而整页白屏。

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { getAgentConfig, getModelConfig, getPreferences, listTemplates } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { SettingsForm } from "@/components/settings-form"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"

const RETRY_CLASS =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"

export function SettingsPage() {
  const { t } = useTranslation()
  const agent = useQuery({ queryKey: ["agent-config"], queryFn: getAgentConfig })
  const model = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig })
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: getPreferences })
  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates })

  if (agent.isPending || model.isPending || prefs.isPending || templates.isPending) return <PageLoading />

  // 四个查询都参与错误判定：任一失败都给出错误码与重试，而不是继续渲染依赖数据的表单。
  const queries = [agent, model, prefs, templates]
  const failed = queries.find((query) => query.isError)

  if (failed) {
    const errorCode = failed.error instanceof ApiRequestError ? failed.error.code : "UNKNOWN_ERROR"
    return (
      <StateBlock
        kind="error"
        title={t("settings.loadError.title")}
        description={t("settings.loadError.description")}
        errorCode={errorCode}
        action={
          <button
            type="button"
            className={RETRY_CLASS}
            onClick={() => {
              for (const query of queries) void query.refetch()
            }}
          >
            {t("common.actions.retry")}
          </button>
        }
      />
    )
  }

  return <SettingsForm agent={agent.data!} model={model.data!} prefs={prefs.data!} templates={templates.data!} />
}
