// 面试场次创建（US-14.7）：简历版本 / 目标 JD / 岗位全部来自真实接口；
// 右栏匹配点 / 风险点 / 岗位范围来自 GET /interview/insights（真实简历 + JD 内容）。
// 确认后创建场次并跳转到场次页。
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, Check, CircleCheck, Lock } from "lucide-react"
import { listJds, listResumes, listResumeVersions } from "@/lib/api"
import { createInterviewSession, getInterviewInsights } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "./section-header"

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"

function formatDate(value: string | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
}

function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const fallback = t("interviewSetup.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

export function SetupScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [resumeId, setResumeId] = useState("")
  const [versionId, setVersionId] = useState("")
  const [jdId, setJdId] = useState("")
  const [role, setRole] = useState("")
  const [createdId, setCreatedId] = useState<string | null>(null)

  const resumesQuery = useQuery({ queryKey: ["resumes", "active"], queryFn: () => listResumes({ lifecycle: "active" }) })
  const versionsQuery = useQuery({
    queryKey: ["resume-versions", resumeId],
    queryFn: () => listResumeVersions(resumeId),
    enabled: resumeId !== "",
  })
  const jdsQuery = useQuery({ queryKey: ["jds"], queryFn: () => listJds() })
  const insightsQuery = useQuery({
    queryKey: ["interview", "insights", versionId, jdId],
    queryFn: () => getInterviewInsights(versionId, jdId),
    enabled: versionId !== "" && jdId !== "",
  })

  const create = useMutation({
    mutationFn: () => createInterviewSession({ resumeVersionId: versionId, jdId, role: role.trim(), questionCount: 3 }),
    onSuccess: (session) => {
      setCreatedId(session.id)
      navigate(`/interview/${session.id}`)
    },
  })

  useEffect(() => {
    if (resumeId === "" || versionsQuery.data === undefined) return
    if (!versionsQuery.data.some((version) => version.id === versionId)) {
      setVersionId(versionsQuery.data[0]?.id ?? "")
    }
  }, [resumeId, versionId, versionsQuery.data])

  useEffect(() => {
    if (jdId === "") return
    const jd = (jdsQuery.data ?? []).find((item) => item.id === jdId)
    if (jd) setRole(jd.role)
  }, [jdId, jdsQuery.data])

  const versions = versionsQuery.data ?? []
  const jds = jdsQuery.data ?? []
  const insights = insightsQuery.data

  const missing: string[] = []
  if (resumeId === "" || versionId === "") missing.push(t("interviewSetup.footer.missingResume"))
  if (jdId === "") missing.push(t("interviewSetup.footer.missingJd"))
  if (role.trim() === "") missing.push(t("interviewSetup.footer.missingRole"))
  const complete = missing.length === 0

  const selectedVersion = versions.find((version) => version.id === versionId)
  const selectedJd = jds.find((jd) => jd.id === jdId)
  const resumeTitle = (resumesQuery.data ?? []).find((resume) => resume.id === resumeId)?.title ?? ""

  const snapshotRows = [
    { id: "resume", value: resumeTitle && selectedVersion ? resumeTitle + " · " + (selectedVersion.message || selectedVersion.id) : t("interviewSetup.snapshot.empty"), active: Boolean(selectedVersion) },
    { id: "jd", value: selectedJd ? (selectedJd.company ? selectedJd.role + " · " + selectedJd.company : selectedJd.role) : t("interviewSetup.snapshot.empty"), active: Boolean(selectedJd) },
    { id: "role", value: role || t("interviewSetup.snapshot.empty"), active: role.trim() !== "" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow={t("interviewSetup.eyebrow")}
        title={t("interviewSetup.title")}
        description={t("interviewSetup.description")}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt/5 px-3 py-1 text-xs font-medium text-cobalt">
            <span aria-hidden className="size-1.5 rounded-full bg-cobalt" />
            {createdId ? t("interviewSetup.status.created") : complete ? t("interviewSetup.status.ready") : t("interviewSetup.status.draft")}
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel title={t("interviewSetup.resume.title")} caption={t("interviewSetup.resume.caption")}>
            {resumesQuery.isPending ? (
              <p className="mt-3 text-xs text-muted-foreground">{t("interviewSetup.resume.loading")}</p>
            ) : resumesQuery.isError ? (
              <p className="mt-3 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{errorText(resumesQuery.error, t)}</p>
            ) : (resumesQuery.data ?? []).length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center text-xs text-muted-foreground">
                {t("interviewSetup.resume.empty")}
              </p>
            ) : (
              <>
                <label htmlFor="setup-resume" className="mt-3 block text-xs font-medium text-muted-foreground">
                  {t("interviewSetup.resume.pickLabel")}
                </label>
                <select
                  id="setup-resume"
                  className={FIELD_CLASS + " mt-1.5"}
                  value={resumeId}
                  disabled={createdId !== null}
                  onChange={(event) => {
                    setResumeId(event.target.value)
                    setVersionId("")
                  }}
                >
                  <option value="">{t("interviewSetup.resume.pickPlaceholder")}</option>
                  {(resumesQuery.data ?? []).map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.title}
                    </option>
                  ))}
                </select>

                {resumeId !== "" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {versionsQuery.isPending ? (
                      <p className="text-xs text-muted-foreground">{t("interviewSetup.resume.versionLoading")}</p>
                    ) : versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("interviewSetup.resume.versionEmpty")}</p>
                    ) : (
                      versions.slice(0, 6).map((version) => {
                        const active = versionId === version.id
                        return (
                          <button
                            key={version.id}
                            type="button"
                            aria-pressed={active}
                            disabled={createdId !== null}
                            onClick={() => setVersionId(version.id)}
                            className={
                              "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                              (active ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-secondary")
                            }
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className={"text-sm font-medium " + (active ? "text-cobalt" : "text-foreground")}>
                                {version.message || version.id}
                              </span>
                              {active ? <Check className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden /> : null}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {t("interviewSetup.resume.versionUpdated", { date: formatDate(version.committedAt) })}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Panel title={t("interviewSetup.jd.title")} caption={t("interviewSetup.jd.caption")}>
              <div className="mt-3 space-y-2">
                {jdsQuery.isPending ? (
                  <p className="text-xs text-muted-foreground">{t("interviewSetup.jd.loading")}</p>
                ) : jdsQuery.isError ? (
                  <p className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{errorText(jdsQuery.error, t)}</p>
                ) : jds.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("interviewSetup.jd.empty")}
                  </p>
                ) : (
                  jds.slice(0, 6).map((jd) => {
                    const active = jdId === jd.id
                    return (
                      <button
                        key={jd.id}
                        type="button"
                        aria-pressed={active}
                        disabled={createdId !== null}
                        onClick={() => setJdId(jd.id)}
                        className={
                          "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                          (active ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-secondary")
                        }
                      >
                        <span className="min-w-0">
                          <span className={"block text-sm font-medium " + (active ? "text-cobalt" : "text-foreground")}>{jd.role}</span>
                          {jd.company ? <span className="mt-0.5 block text-xs text-muted-foreground">{jd.company}</span> : null}
                        </span>
                        {active ? <Check className="size-4 shrink-0 text-cobalt" aria-hidden /> : null}
                      </button>
                    )
                  })
                )}
              </div>
            </Panel>

            <Panel title={t("interviewSetup.role.title")} caption={t("interviewSetup.role.caption")} className="self-start">
              <label htmlFor="setup-role" className="mt-3 block text-xs font-medium text-muted-foreground">
                {t("interviewSetup.role.label")}
              </label>
              <input
                id="setup-role"
                type="text"
                value={role}
                disabled={createdId !== null}
                placeholder={t("interviewSetup.role.placeholder")}
                onChange={(event) => setRole(event.target.value)}
                className={FIELD_CLASS + " mt-1.5"}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("interviewSetup.role.hint")}</p>
            </Panel>
          </div>
        </div>

        <Panel title={t("interviewSetup.snapshot.title")} caption={t("interviewSetup.snapshot.caption")}>
          <dl className="mt-3 space-y-2">
            {snapshotRows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary px-3 py-2">
                <dt className="shrink-0 text-xs text-muted-foreground">{t("interviewSetup.snapshot.fields." + row.id)}</dt>
                <dd className={"min-w-0 text-right text-sm font-medium " + (row.active ? "text-foreground" : "text-muted-foreground")}>{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 space-y-4 border-t border-border pt-4">
            {versionId === "" || jdId === "" ? (
              <p className="text-xs text-muted-foreground">{t("interviewSetup.snapshot.insightsHint")}</p>
            ) : insightsQuery.isPending ? (
              <p className="text-xs text-muted-foreground">{t("interviewSetup.snapshot.insightsLoading")}</p>
            ) : insightsQuery.isError ? (
              <div role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2">
                <p className="text-xs font-medium text-coral">{t("interviewSetup.snapshot.insightsErrorTitle")}</p>
                <p className="mt-1 text-xs text-secondary-foreground">{errorText(insightsQuery.error, t)}</p>
              </div>
            ) : (
              <>
                <section>
                  <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.matchTitle")}</h3>
                  {(insights?.matchPoints ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {(insights?.matchPoints ?? []).map((point) => (
                        <li key={point} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.riskTitle")}</h3>
                  {(insights?.riskPoints ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {(insights?.riskPoints ?? []).map((point) => (
                        <li key={point} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.scopeTitle")}</h3>
                  {(insights?.scopeKeywords ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(insights?.scopeKeywords ?? []).map((keyword) => (
                        <span key={keyword} className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
        {createdId ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cobalt/40 bg-cobalt/5 px-2.5 py-1 text-xs font-medium text-cobalt">
                <Lock className="size-3.5" aria-hidden />
                {t("interviewSetup.footer.frozen")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("interviewSetup.footer.sessionLabel")}
                <span className="ml-1.5 font-medium text-foreground">{createdId}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatedId(null)
                setVersionId("")
                setJdId("")
                setRole("")
              }}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {t("interviewSetup.footer.reset")}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {complete ? t("interviewSetup.footer.readyHint") : t("interviewSetup.footer.missingPrefix") + missing.join(t("interviewSetup.footer.separator"))}
            </p>
            <button
              type="button"
              disabled={!complete || create.isPending}
              onClick={() => create.mutate()}
              className="rounded-lg bg-cobalt px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-cobalt/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {create.isPending ? t("interviewSetup.footer.creating") : t("interviewSetup.footer.confirm")}
            </button>
          </>
        )}
      </div>
      {create.isError ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
          {errorText(create.error, t)}
        </p>
      ) : null}
    </div>
  )
}

export default SetupScreen
