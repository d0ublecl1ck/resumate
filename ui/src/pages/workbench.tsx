// SCR-001 求职工作台（Hub）。
// 只承载「摘要 + 入口」：每张卡片跳转到对应 spoke 页面去实际操作，
// 待确认动作、Diff、Run 不在首页处理（它们属于 SCR-003 / SCR-108）。

import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { getWorkbenchSummary } from "@/lib/api"
import { SaveStateBadge } from "@/components/kit/badges"
import { StateBlock } from "@/components/kit/state-block"
import { PageLoading } from "@/pages/states"
import { ArrowRight, Boxes, CircleCheck, FileText, Plus, ShieldQuestion, UserRound } from "lucide-react"

export function WorkbenchPage() {
  const { data: s, isPending } = useQuery({ queryKey: ["workbench-summary"], queryFn: getWorkbenchSummary })

  if (isPending || !s) return <PageLoading />

  if (!s.hasProfile) {
    return (
      <div className="space-y-8">
        <Hero pendingCount={0} draftCount={0} />
        <StateBlock
          kind="empty"
          title="先建立你的事实库"
          description="Resumate 从真实职业事实出发。建立 Profile 后，才能生成有依据、可追溯的岗位简历。"
          action={
            <Link to="/profile" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              建立 Profile <ArrowRight className="size-4" />
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
                有 {s.pendingActionCount} 项 Agent 修改待确认
              </p>
              <p className="text-xs text-muted-foreground">在「{s.latestResume.title}」的编辑工作台里审阅并处理</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-cobalt">
            去处理 <ArrowRight className="size-4" />
          </span>
        </Link>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {/* 继续编辑最新简历 */}
        {s.latestResume ? (
          <EntryCard
            to={`/resumes/${s.latestResume.id}`}
            icon={FileText}
            eyebrow="继续编辑"
            title={s.latestResume.title}
            meta={
              <span className="flex items-center gap-2">
                <SaveStateBadge state={s.latestResume.saveState} />
                <span className="text-xs text-muted-foreground">更新于 {s.latestResume.updatedAt.slice(5, 16).replace("T", " ")}</span>
              </span>
            }
          />
        ) : null}

        {/* 最新 JD */}
        {s.latestJd ? (
          <EntryCard
            to={`/jds/${s.latestJd.id}`}
            icon={Boxes}
            eyebrow="最新岗位"
            title={`${s.latestJd.role}${s.latestJd.company ? " · " + s.latestJd.company : ""}`}
            meta={<span className="text-xs text-muted-foreground">rev.{s.latestJd.revision} · 可发起岗位微调</span>}
          />
        ) : null}

        {/* Profile 完整度 */}
        <EntryCard
          to="/profile"
          icon={UserRound}
          eyebrow="事实库完整度"
          title={`${s.profileCompleteness}% 完整`}
          meta={
            <span className="text-xs text-muted-foreground">
              {s.unverifiedFactCount > 0 ? `${s.unverifiedFactCount} 条事实待核实` : "全部事实已核实"}
            </span>
          }
        />

        {/* 简历库入口 */}
        <EntryCard
          to="/resumes"
          icon={FileText}
          eyebrow="全部简历"
          title="进入简历库"
          meta={<span className="text-xs text-muted-foreground">{s.uncommittedDraftCount} 份有未提交草稿</span>}
        />
      </div>

      {/* 求职阶段进度 */}
      <section className="card-soft p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">求职阶段</h2>
        <ol className="grid gap-3 sm:grid-cols-4">
          {s.jobStage.map((stage, i) => (
            <li key={stage.label} className="flex items-center gap-2.5">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stage.done ? "bg-cobalt text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                {stage.done ? <CircleCheck className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={`text-sm ${stage.done ? "text-foreground" : "text-muted-foreground"}`}>{stage.label}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Hero({ pendingCount, draftCount }: { pendingCount: number; draftCount: number }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">你好，张沐</p>
        <h1 className="font-serif text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-4xl text-balance">
          AI 全程陪跑，<span className="text-cobalt">从经历到 offer</span>
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground text-pretty">
          从对话录入真实经历，到 AI 辅助打磨每一版简历，再到模拟面试逐题演练——一条龙帮你拿下心仪岗位。
        </p>
        <p className="text-xs text-muted-foreground">
          {draftCount} 份未提交草稿 · {pendingCount} 项待确认修改
        </p>
      </div>
      <Link to="/resumes?create=1" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        <Plus className="size-4" aria-hidden /> 新建简历
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
