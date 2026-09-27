// SCR-001 求职工作台（Hub）。
// 只承载「摘要 + 入口」：每张卡片跳转到对应 spoke 页面去实际操作，
// 待确认动作、Diff、Run 不在首页处理（它们属于 SCR-003 / SCR-108）。

import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { getWorkbenchSummary } from "@/lib/api"
import { SaveStateBadge } from "@/components/kit/badges"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"
import { ArrowRight, Boxes, CircleCheck, FileText, Plus, ShieldQuestion, UserRound } from "lucide-react"

/** 用户昵称属于用户数据，不参与翻译（US-1.6）；未接入账户昵称前保留演示值。 */
const USER_DISPLAY_NAME = "张沐" // i18n-allow: 用户数据显示名，不翻译（US-13.4）

/** 按本地时段选择问候语（US-1.6：问候随语言与当地时段变化）。 */
function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning"
  if (hour >= 12 && hour < 18) return "afternoon"
  return "evening"
}

export function WorkbenchPage() {
  const { t } = useTranslation()
  const { data: s, isPending } = useQuery({ queryKey: ["workbench-summary"], queryFn: getWorkbenchSummary })

  if (isPending || !s) return <PageLoading />

  if (!s.hasProfile) {
    return (
      <div className="space-y-8">
        <Hero pendingCount={0} draftCount={0} />
        <StateBlock
          kind="empty"
          title={t("workbench.empty.title")}
          description={t("workbench.empty.description")}
          action={
            <Link to="/profile" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {t("workbench.empty.action")} <ArrowRight className="size-4" />
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Hero pendingCount={s.pendingActionCount} draftCount={s.uncommittedDraftCount} />

      {/* 待确认摘要：只提示 + 跳转，不在首页做接受/拒绝 */}
      {s.pendingActionCount > 0 && s.latestResume ? (
        <Link
          to={`/resumes/${s.latestResume.id}?panel=run`}
          className="card-frame flex items-center justify-between gap-4 p-4 transition-colors hover:bg-secondary/50"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-coral/10 text-coral">
              <ShieldQuestion className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("workbench.pending.title", { n: s.pendingActionCount })}
              </p>
              <p className="text-xs text-muted-foreground">{t("workbench.pending.description", { title: s.latestResume.title })}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-cobalt">
            {t("workbench.pending.action")} <ArrowRight className="size-4" />
          </span>
        </Link>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {/* 继续编辑最新简历 */}
        {s.latestResume ? (
          <EntryCard
            to={`/resumes/${s.latestResume.id}`}
            icon={FileText}
            eyebrow={t("workbench.entry.continueEditing")}
            title={s.latestResume.title}
            meta={
              <span className="flex items-center gap-2">
                <SaveStateBadge state={s.latestResume.saveState} />
                <span className="text-xs text-muted-foreground">{t("workbench.entry.updatedAt", { date: s.latestResume.updatedAt.slice(5, 16).replace("T", " ") })}</span>
              </span>
            }
          />
        ) : null}

        {/* 最新 JD */}
        {s.latestJd ? (
          <EntryCard
            to={`/jds/${s.latestJd.id}`}
            icon={Boxes}
            eyebrow={t("workbench.entry.latestJd")}
            title={`${s.latestJd.role}${s.latestJd.company ? " · " + s.latestJd.company : ""}`}
            meta={<span className="text-xs text-muted-foreground">{t("workbench.entry.jdMeta", { revision: s.latestJd.revision })}</span>}
          />
        ) : null}

        {/* Profile 完整度 */}
        <EntryCard
          to="/profile"
          icon={UserRound}
          eyebrow={t("workbench.entry.profileCompleteness")}
          title={t("workbench.entry.completenessValue", { percent: s.profileCompleteness })}
          meta={
            <span className="text-xs text-muted-foreground">
              {s.unverifiedFactCount > 0 ? t("workbench.entry.unverifiedFacts", { facts: s.unverifiedFactCount }) : t("workbench.entry.allFactsVerified")}
            </span>
          }
        />

        {/* 简历库入口 */}
        <EntryCard
          to="/resumes"
          icon={FileText}
          eyebrow={t("workbench.entry.allResumes")}
          title={t("workbench.entry.toResumeLibrary")}
          meta={<span className="text-xs text-muted-foreground">{t("workbench.entry.uncommittedDrafts", { drafts: s.uncommittedDraftCount })}</span>}
        />
      </div>

      {/* 求职阶段进度 */}
      <section className="card-soft p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">{t("workbench.jobStage")}</h2>
        <ol className="grid gap-3 sm:grid-cols-4">
          {s.jobStage.map((stage, i) => (
            <li key={stage.label} className="flex items-center gap-2.5">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stage.done ? "bg-cobalt text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                {stage.done ? <CircleCheck className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={`text-sm ${stage.done ? "text-foreground" : "text-muted-foreground"}`}>{t(stage.label)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Hero({ pendingCount, draftCount }: { pendingCount: number; draftCount: number }) {
  const { t } = useTranslation()
  const period = greetingPeriod(new Date().getHours())

  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("workbench.hero.greeting." + period, { name: USER_DISPLAY_NAME })}</p>
        <h1 className="font-serif text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-4xl text-balance">
          {t("workbench.hero.headlinePrefix")}<span className="text-cobalt">{t("workbench.hero.headlineHighlight")}</span>
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground text-pretty">
          {t("workbench.hero.description")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("workbench.hero.stats", { draftCount, pendingCount })}
        </p>
      </div>
      <Link to="/resumes?create=1" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        <Plus className="size-4" aria-hidden /> {t("workbench.hero.newResume")}
      </Link>
    </header>
  )
}

function EntryCard({
  to,
  icon: Icon,
  eyebrow,
  title,
  meta,
}: {
  to: string
  icon: React.ElementType
  eyebrow: string
  title: string
  meta?: React.ReactNode
}) {
  return (
    <Link to={to} className="group card-soft flex flex-col gap-3 p-5 transition-colors hover:border-foreground/30 hover:bg-secondary/40">
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <p className="mt-0.5 font-serif text-lg font-bold text-foreground text-balance">{title}</p>
      </div>
      {meta}
    </Link>
  )
}
