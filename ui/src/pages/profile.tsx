// SCR-004 个人资料（Page）。
// 查询失败必须走统一错误状态块（错误码 + 重试），不能把 undefined 交给 ProfileWorkspace 永久停在加载中。

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { getProfile } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { ProfileWorkspace } from "@/components/profile-workspace"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"

const RETRY_CLASS =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"

export function ProfilePage() {
  const { t } = useTranslation()
  const { data: profile, isPending, isError, error, refetch } = useQuery({ queryKey: ["profile"], queryFn: getProfile })

  if (isPending) return <PageLoading />

  if (isError) {
    const errorCode = error instanceof ApiRequestError ? error.code : "UNKNOWN_ERROR"
    return (
      <StateBlock
        kind="error"
        title={t("profile.loadError.title")}
        description={t("profile.loadError.description")}
        errorCode={errorCode}
        action={
          <button type="button" className={RETRY_CLASS} onClick={() => void refetch()}>
            {t("common.actions.retry")}
          </button>
        }
      />
    )
  }

  if (!profile) return <PageLoading />

  return <ProfileWorkspace profile={profile} />
}
