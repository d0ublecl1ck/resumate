// SCR-014 模拟面试（Page）：选简历版本与目标 JD 建会话，并列出历史会话。
// 约束：字段用受控的原生控件承载，不引入内建表单元素；文案一律走 interviewWorkflow 命名空间。
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { MessagesSquare, Settings } from "lucide-react"

import { listJds, listResumes, listResumeVersions } from "@/lib/api"
import { createInterviewSession, listInterviewSessions } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "@/features/interview/section-header"
import { StateBlock } from "@/components/kit/state-block"

const QUESTION_COUNTS = [3, 4, 5]
const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"

/** 把机器错误码映射到本命名空间的 i18n 文案；未知码回落到 generic，绝不泄漏后端英文原文。 */
function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const fallback = t("interviewWorkflow.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

/** 统一失败出口：标题 + 中文说明；MODEL_NOT_CONFIGURED 额外给出「去设置模型」引导。 */
export function InterviewErrorNotice({ title, cause }: { title: string; cause: unknown }) {
  const { t } = useTranslation()
  const { code } = userFacingError(cause, t("interviewWorkflow.errors.generic"))
  return (
    <div role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3">
      <p className="text-sm font-medium text-coral">{title}</p>
      <p className="mt-1 text-sm text-secondary-foreground">{errorText(cause, t)}</p>
      {code === "MODEL_NOT_CONFIGURED" ? (
        <Link
          to="/settings"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Settings className="size-3.5" aria-hidden />
          {t("interviewWorkflow.errors.openSettings")}
        </Link>
      ) : null}
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export function InterviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [resumeId, setResumeId] = useState("")
  const [resumeVersionId, setResumeVersionId] = useState("")
  const [jdId, setJdId] = useState("")
  const [role, setRole] = useState("")
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNTS[0])

  const resumes = useQuery({ queryKey: ["resumes", "active"], queryFn: () => listResumes({ lifecycle: "active" }) })
  const jds = useQuery({ queryKey: ["jds"], queryFn: () => listJds() })
  const versions = useQuery({
    queryKey: ["resume-versions", resumeId],
    queryFn: () => listResumeVersions(resumeId),
    enabled: resumeId !== "",
  })
  const sessions = useQuery({ queryKey: ["interview", "sessions"], queryFn: () => listInterviewSessions() })

  const create = useMutation({
    mutationFn: () =>
      createInterviewSession({ resumeVersionId, jdId, role: role.trim(), questionCount }),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] })
      navigate(`/interview/${session.id}`)
    },
  })

  const canSubmit = resumeId !== "" && resumeVersionId !== "" && jdId !== "" && role.trim() !== "" && !create.isPending

  function handleResumeChange(value: string) {
    setResumeId(value)
    setResumeVersionId("")
  }

  function handleJdChange(value: string) {
    setJdId(value)
    const jd = (jds.data ?? []).find((item) => item.id === value)
    setRole(jd?.role ?? "")
  }

  const versionOptions = versions.data ?? []

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow={t("interviewWorkflow.meta.eyebrow")}
        title={t("interviewWorkflow.meta.title")}
        description={t("interviewWorkflow.meta.description")}
      />

      <Panel title={t("interviewWorkflow.create.title")} caption={t("interviewWorkflow.create.caption")}>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="interview-resume" className="text-xs font-medium text-muted-foreground">
              {t("interviewWorkflow.create.resumeLabel")}
            </label>
            <select
              id="interview-resume"
              className={FIELD_CLASS}
              value={resumeId}
              onChange={(event) => handleResumeChange(event.target.value)}
            >
              <option value="">{t("interviewWorkflow.create.resumePlaceholder")}</option>
              {(resumes.data ?? []).map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="interview-version" className="text-xs font-medium text-muted-foreground">
              {t("interviewWorkflow.create.versionLabel")}
            </label>
            <select
              id="interview-version"
              className={FIELD_CLASS}
              value={resumeVersionId}
              disabled={resumeId === "" || versions.isPending}
              onChange={(event) => setResumeVersionId(event.target.value)}
            >
              <option value="">
                {resumeId !== "" && versions.isPending
                  ? t("interviewWorkflow.create.versionLoading")
                  : resumeId !== "" && versionOptions.length === 0
                    ? t("interviewWorkflow.create.versionEmpty")
                    : t("interviewWorkflow.create.versionPlaceholder")}
              </option>
              {versionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.message || version.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="interview-jd" className="text-xs font-medium text-muted-foreground">
              {t("interviewWorkflow.create.jdLabel")}
            </label>
            <select id="interview-jd" className={FIELD_CLASS} value={jdId} onChange={(event) => handleJdChange(event.target.value)}>
              <option value="">{t("interviewWorkflow.create.jdPlaceholder")}</option>
              {(jds.data ?? []).map((jd) => (
                <option key={jd.id} value={jd.id}>
                  {jd.company ? `${jd.role} · ${jd.company}` : jd.role}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="interview-role" className="text-xs font-medium text-muted-foreground">
              {t("interviewWorkflow.create.roleLabel")}
            </label>
            <input
              id="interview-role"
              type="text"
              className={FIELD_CLASS}
              value={role}
              placeholder={t("interviewWorkflow.create.rolePlaceholder")}
              onChange={(event) => setRole(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("interviewWorkflow.create.roleHint")}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="interview-question-count" className="text-xs font-medium text-muted-foreground">
              {t("interviewWorkflow.create.questionCountLabel")}
            </label>
            <select
              id="interview-question-count"
              className={FIELD_CLASS}
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
            >
              {QUESTION_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {t("interviewWorkflow.create.questionCountOption", { count })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessagesSquare className="size-4" aria-hidden />
            {create.isPending ? t("interviewWorkflow.create.submitting") : t("interviewWorkflow.create.submit")}
          </button>
          <p className="text-xs text-muted-foreground">
            {resumeId === ""
              ? t("interviewWorkflow.create.needResume")
              : resumeVersionId === ""
                ? t("interviewWorkflow.create.needVersion")
                : jdId === ""
                  ? t("interviewWorkflow.create.needJd")
                  : role.trim() === ""
                    ? t("interviewWorkflow.create.needRole")
                    : ""}
          </p>
        </div>

        {create.isError ? (
          <div className="mt-4">
            <InterviewErrorNotice title={t("interviewWorkflow.create.errorTitle")} cause={create.error} />
          </div>
        ) : null}
      </Panel>

      <Panel title={t("interviewWorkflow.list.title")} caption={t("interviewWorkflow.list.caption")}>
        {sessions.isPending ? (
          <div className="mt-3">
            <StateBlock kind="loading" title={t("interviewWorkflow.list.loading")} />
          </div>
        ) : sessions.isError ? (
          <div className="mt-3">
            <InterviewErrorNotice title={t("interviewWorkflow.list.errorTitle")} cause={sessions.error} />
          </div>
        ) : (sessions.data ?? []).length === 0 ? (
          <div className="mt-3">
            <StateBlock
              kind="empty"
              title={t("interviewWorkflow.list.emptyTitle")}
              description={t("interviewWorkflow.list.emptyDescription")}
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {(sessions.data ?? []).map((session) => {
              const statusLabel =
                session.status === "completed"
                  ? t("interviewWorkflow.list.statusCompleted")
                  : t("interviewWorkflow.list.statusActive")
              return (
                <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link to={`/interview/${session.id}`} className="text-sm font-medium text-foreground hover:text-cobalt">
                      {session.role}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("interviewWorkflow.list.createdAt", { date: formatDate(session.createdAt) })}
                      {" · "}
                      {t("interviewWorkflow.list.progressValue", {
                        answered: session.answeredCount,
                        total: session.questionCount,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {statusLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {session.hasReport ? t("interviewWorkflow.list.reportYes") : t("interviewWorkflow.list.reportNo")}
                    </span>
                    <Link
                      to={`/interview/${session.id}`}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      {session.hasReport
                        ? t("interviewWorkflow.list.openReport")
                        : t("interviewWorkflow.list.open")}
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
