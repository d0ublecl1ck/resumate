// 面试场次创建（US-14.7 · 用 Resume 与 JD 准备面试，Storybook 先行屏幕）。
// 左栏配置简历版本 / 目标 JD / 岗位，右栏实时汇总本场快照；
// 三项选齐后才能确认开始，确认后快照冻结并生成本场编号。
// 数据全部为文件内 mock，不发网络请求；可见文案统一走 interviewSetup 命名空间。

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Check, CircleCheck, Lock } from "lucide-react"
import { Panel, SectionHeader } from "./section-header"

type ResumeId = "v1" | "v2" | "v3"
type JdId = "j1" | "j2" | "j3"
type RoleId = "java" | "web"

const RESUME_IDS: ResumeId[] = ["v1", "v2", "v3"]
const JD_IDS: JdId[] = ["j1", "j2", "j3"]
const ROLE_IDS: RoleId[] = ["java", "web"]

const MATCH_COUNT = 3
const RISK_COUNT = 2
const SCOPE_COUNT = 3

// 冻结后的场次编号：演示固定值，保证截图稳定。
const SESSION_ID = "IV-2026-1009-0421"

function numberedKeys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => prefix + (index + 1))
}

export function SetupScreen() {
  const { t } = useTranslation()
  const [resumeId, setResumeId] = useState<ResumeId | null>(null)
  const [jdId, setJdId] = useState<JdId | null>(null)
  const [roleId, setRoleId] = useState<RoleId | null>(null)
  const [jdText, setJdText] = useState("")
  const [created, setCreated] = useState(false)

  const missing: string[] = []
  if (!resumeId) missing.push(t("interviewSetup.footer.missingResume"))
  if (!jdId) missing.push(t("interviewSetup.footer.missingJd"))
  if (!roleId) missing.push(t("interviewSetup.footer.missingRole"))
  const complete = missing.length === 0
  const locked = created

  const status = created
    ? t("interviewSetup.status.created")
    : complete
      ? t("interviewSetup.status.ready")
      : t("interviewSetup.status.draft")

  const resumeValue = resumeId
    ? t("interviewSetup.resume.versions." + resumeId + ".name")
    : t("interviewSetup.snapshot.empty")
  const jdValue = jdId
    ? t("interviewSetup.jd.optionValue", {
        role: t("interviewSetup.jd.options." + jdId + ".role"),
        company: t("interviewSetup.jd.options." + jdId + ".company"),
      })
    : t("interviewSetup.snapshot.empty")
  const roleValue = roleId ? t("interviewSetup.role.options." + roleId) : t("interviewSetup.snapshot.empty")

  const snapshotRows = [
    { id: "resume", value: resumeValue, active: Boolean(resumeId) },
    { id: "jd", value: jdValue, active: Boolean(jdId) },
    { id: "role", value: roleValue, active: Boolean(roleId) },
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
            {status}
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/* a) 简历版本：单选卡片，卡片内给出更新时间 */}
          <Panel title={t("interviewSetup.resume.title")} caption={t("interviewSetup.resume.caption")}>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {RESUME_IDS.map((id) => {
                const active = resumeId === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => setResumeId(id)}
                    className={
                      "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                      (active ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-secondary")
                    }
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className={"text-sm font-medium " + (active ? "text-cobalt" : "text-foreground")}>
                        {t("interviewSetup.resume.versions." + id + ".name")}
                      </span>
                      {active ? <Check className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden /> : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("interviewSetup.resume.versions." + id + ".updated")}
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          {/* b) 目标 JD：单选行 + 粘贴文本（仅本地状态） */}
          <Panel title={t("interviewSetup.jd.title")} caption={t("interviewSetup.jd.caption")}>
            <div className="mt-3 space-y-2">
              {JD_IDS.map((id) => {
                const active = jdId === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => setJdId(id)}
                    className={
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                      (active ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-secondary")
                    }
                  >
                    <span className="min-w-0">
                      <span className={"block text-sm font-medium " + (active ? "text-cobalt" : "text-foreground")}>
                        {t("interviewSetup.jd.options." + id + ".role")}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("interviewSetup.jd.options." + id + ".company")}
                      </span>
                    </span>
                    {active ? <Check className="size-4 shrink-0 text-cobalt" aria-hidden /> : null}
                  </button>
                )
              })}
            </div>

            <div className="mt-3">
              <label htmlFor="setup-jd-text" className="text-xs font-medium text-muted-foreground">
                {t("interviewSetup.jd.pasteLabel")}
              </label>
              <textarea
                id="setup-jd-text"
                rows={2}
                value={jdText}
                disabled={locked}
                onChange={(event) => setJdText(event.target.value)}
                placeholder={t("interviewSetup.jd.pastePlaceholder")}
                className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-cobalt disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("interviewSetup.jd.pasteCount", { n: jdText.length })}
              </p>
            </div>
          </Panel>

          {/* c) 岗位：segmented 单选 */}
          <Panel title={t("interviewSetup.role.title")} caption={t("interviewSetup.role.caption")} className="self-start">
            <div
              role="group"
              aria-label={t("interviewSetup.role.title")}
              className="mt-3 inline-flex rounded-lg border border-border bg-muted p-1"
            >
              {ROLE_IDS.map((id) => {
                const active = roleId === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    disabled={locked}
                    onClick={() => setRoleId(id)}
                    className={
                      "rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                      (active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {t("interviewSetup.role.options." + id)}
                  </button>
                )
              })}
            </div>
          </Panel>
          </div>
        </div>

        {/* 右栏：本场快照，随左侧选择实时变化 */}
        <Panel title={t("interviewSetup.snapshot.title")} caption={t("interviewSetup.snapshot.caption")}>
          <dl className="mt-3 space-y-2">
            {snapshotRows.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary px-3 py-2"
              >
                <dt className="shrink-0 text-xs text-muted-foreground">
                  {t("interviewSetup.snapshot.fields." + row.id)}
                </dt>
                <dd className={"min-w-0 text-right text-sm font-medium " + (row.active ? "text-foreground" : "text-muted-foreground")}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 space-y-4 border-t border-border pt-4">
            {/* 匹配点：选中 JD 后给出三条带对勾的依据 */}
            <section>
              <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.matchTitle")}</h3>
              {jdId ? (
                <ul className="mt-2 space-y-1.5">
                  {numberedKeys("interviewSetup.snapshot.match." + jdId + ".m", MATCH_COUNT).map((key) => (
                    <li key={key} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                      <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
              )}
            </section>

            {/* 风险点：选中 JD 后给出两条带警示的依据 */}
            <section>
              <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.riskTitle")}</h3>
              {jdId ? (
                <ul className="mt-2 space-y-1.5">
                  {numberedKeys("interviewSetup.snapshot.risk." + jdId + ".r", RISK_COUNT).map((key) => (
                    <li key={key} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
              )}
            </section>

            {/* 岗位范围：选中岗位后给出三个关键词 chip */}
            <section>
              <h3 className="text-xs font-semibold text-foreground">{t("interviewSetup.snapshot.scopeTitle")}</h3>
              {roleId ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {numberedKeys("interviewSetup.snapshot.scope." + roleId + ".k", SCOPE_COUNT).map((key) => (
                    <span key={key} className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                      {t(key)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t("interviewSetup.snapshot.empty")}</p>
              )}
            </section>
          </div>
        </Panel>
      </div>

      {/* 底部：未选齐时禁用主按钮并提示缺项；确认后展示冻结态与场次编号 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3.5">
        {created ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cobalt/40 bg-cobalt/5 px-2.5 py-1 text-xs font-medium text-cobalt">
                <Lock className="size-3.5" aria-hidden />
                {t("interviewSetup.footer.frozen")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("interviewSetup.footer.sessionLabel")}
                <span className="ml-1.5 font-medium text-foreground">{SESSION_ID}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCreated(false)}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {t("interviewSetup.footer.reset")}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {complete
                ? t("interviewSetup.footer.readyHint")
                : t("interviewSetup.footer.missingPrefix") + missing.join(t("interviewSetup.footer.separator"))}
            </p>
            <button
              type="button"
              disabled={!complete}
              onClick={() => setCreated(true)}
              className="rounded-lg bg-cobalt px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-cobalt/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {t("interviewSetup.footer.confirm")}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default SetupScreen
