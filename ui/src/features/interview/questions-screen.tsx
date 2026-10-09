// Epic 14 · US-14.1 根据简历生成面试题（Storybook 先行屏幕）。
// 左列表 + 右详情：岗位/难度/题型筛选、生成与重新生成（1 秒加载态）、
// 行切换详情与参考答案折叠全部为本地状态；数据均为文件内 mock，不发任何网络请求。
// 所有可见文案走 interviewQuestions 命名空间。
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { BookOpenCheck, ChevronDown, ChevronUp, Info, RefreshCw, Sparkles, Target } from "lucide-react"
import { Panel, SectionHeader } from "@/features/interview/section-header"

type PositionId = "java" | "web"
type DifficultyId = "easy" | "medium" | "hard"
type TypeId = "technical" | "deepDive" | "scenario" | "behavioral"
type BatchId = "a" | "b"

const POSITIONS: PositionId[] = ["java", "web"]
const DIFFICULTIES: DifficultyId[] = ["easy", "medium", "hard"]
const TYPES: TypeId[] = ["technical", "deepDive", "scenario", "behavioral"]

// 每道题只保留结构性字段；题干、依据、证据与参考答案都在命名空间里。
// roles 决定岗位筛选是否收录该题，题型/难度由筛选 chip 实时过滤。
type QuestionSeed = {
  id: string
  type: TypeId
  difficulty: DifficultyId
  roles: PositionId[]
}

const BATCHES: Record<BatchId, QuestionSeed[]> = {
  a: [
    { id: "q1", type: "technical", difficulty: "medium", roles: ["java", "web"] },
    { id: "q2", type: "deepDive", difficulty: "hard", roles: ["java"] },
    { id: "q3", type: "scenario", difficulty: "medium", roles: ["java", "web"] },
    { id: "q4", type: "behavioral", difficulty: "easy", roles: ["java", "web"] },
    { id: "q5", type: "deepDive", difficulty: "medium", roles: ["web"] },
    { id: "q6", type: "technical", difficulty: "hard", roles: ["java", "web"] },
  ],
  b: [
    { id: "q1", type: "deepDive", difficulty: "medium", roles: ["java", "web"] },
    { id: "q2", type: "scenario", difficulty: "hard", roles: ["java"] },
    { id: "q3", type: "technical", difficulty: "easy", roles: ["java", "web"] },
    { id: "q4", type: "behavioral", difficulty: "medium", roles: ["java", "web"] },
    { id: "q5", type: "deepDive", difficulty: "hard", roles: ["web"] },
    { id: "q6", type: "scenario", difficulty: "medium", roles: ["java", "web"] },
  ],
}

const DIFFICULTY_TONE: Record<DifficultyId, string> = {
  easy: "border-border bg-muted text-muted-foreground",
  medium: "border-cobalt/40 bg-cobalt/5 text-cobalt",
  hard: "border-coral/40 bg-coral/5 text-coral",
}

function chipClass(active: boolean) {
  return (
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
    (active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  )
}

export function QuestionsScreen() {
  const { t } = useTranslation()
  const [position, setPosition] = useState<PositionId>("java")
  const [difficulties, setDifficulties] = useState<DifficultyId[]>([])
  const [types, setTypes] = useState<TypeId[]>([])
  const [batch, setBatch] = useState<BatchId>("a")
  const [selectedId, setSelectedId] = useState("q1")
  const [pending, setPending] = useState<"generate" | "regenerate" | null>(null)
  const [regenerated, setRegenerated] = useState(false)
  const [openAnswerKey, setOpenAnswerKey] = useState<string | null>(null)

  const loading = pending !== null

  // 生成 / 重新生成：统一先进入 1 秒加载态，再替换列表；重新生成保留当前筛选。
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => {
      if (pending === "regenerate") {
        setBatch((prev) => (prev === "a" ? "b" : "a"))
        setRegenerated(true)
      } else {
        setBatch("a")
        setRegenerated(false)
      }
      setPending(null)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [pending])

  const batchSeeds = BATCHES[batch]
  const visible = useMemo(() => {
    const typeFilter = types.length > 0 ? types : TYPES
    const difficultyFilter = difficulties.length > 0 ? difficulties : DIFFICULTIES
    return batchSeeds.filter(
      (q) =>
        q.roles.includes(position) &&
        typeFilter.includes(q.type) &&
        difficultyFilter.includes(q.difficulty),
    )
  }, [batchSeeds, position, types, difficulties])

  const selected = visible.find((q) => q.id === selectedId) ?? visible[0] ?? null
  const selectedKey = selected ? batch + "." + selected.id : null
  const keyBase = selected ? "interviewQuestions.batches." + batch + "." + selected.id : null
  const answerOpen = selectedKey !== null && openAnswerKey === selectedKey

  function toggleDifficulty(value: DifficultyId) {
    setDifficulties((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  function toggleType(value: TypeId) {
    setTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow={t("interviewQuestions.eyebrow")}
        title={t("interviewQuestions.title")}
        description={t("interviewQuestions.description")}
        actions={
          <>
            <button
              type="button"
              onClick={() => setPending("generate")}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="size-4" aria-hidden />
              {t("interviewQuestions.actions.generate")}
            </button>
            <button
              type="button"
              onClick={() => setPending("regenerate")}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} aria-hidden />
              {t("interviewQuestions.actions.regenerate")}
            </button>
          </>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <ChipGroup label={t("interviewQuestions.filters.position")}>
            {POSITIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={position === value}
                onClick={() => setPosition(value)}
                className={chipClass(position === value)}
              >
                {t("interviewQuestions.positions." + value)}
              </button>
            ))}
          </ChipGroup>

          <ChipGroup label={t("interviewQuestions.filters.difficulty")}>
            {DIFFICULTIES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={difficulties.includes(value)}
                onClick={() => toggleDifficulty(value)}
                className={chipClass(difficulties.includes(value))}
              >
                {t("interviewQuestions.difficulties." + value)}
              </button>
            ))}
          </ChipGroup>

          <ChipGroup label={t("interviewQuestions.filters.type")}>
            {TYPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={types.includes(value)}
                onClick={() => toggleType(value)}
                className={chipClass(types.includes(value))}
              >
                {t("interviewQuestions.types." + value)}
              </button>
            ))}
          </ChipGroup>

          <span className="text-xs text-muted-foreground">{t("interviewQuestions.filters.hint")}</span>
        </div>
      </Panel>

      {regenerated ? (
        <p className="flex items-center gap-2 rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-xs font-medium text-cobalt">
          <Info className="size-4 shrink-0" aria-hidden />
          {t("interviewQuestions.notice.regenerate")}
        </p>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <Panel
          title={t("interviewQuestions.list.title")}
          caption={
            loading
              ? t("interviewQuestions.status.generatingHint")
              : t("interviewQuestions.status.resultMeta", {
                  role: t("interviewQuestions.positions." + position),
                  n: visible.length,
                })
          }
        >
          {loading ? (
            <div className="mt-4 space-y-3" aria-hidden>
              <p className="inline-flex items-center gap-2 text-xs font-medium text-cobalt">
                <RefreshCw className="size-3.5 animate-spin" />
                {t("interviewQuestions.status.generating")}
              </p>
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="animate-pulse rounded-lg border border-border p-3">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="mt-2 h-4 w-full rounded bg-muted" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t("interviewQuestions.list.empty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {visible.map((q) => {
                const active = selected?.id === q.id
                const base = "interviewQuestions.batches." + batch + "." + q.id
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(q.id)}
                      className={
                        "w-full rounded-lg border p-3 text-left transition-colors " +
                        (active
                          ? "border-cobalt bg-cobalt/5"
                          : "border-border bg-background hover:bg-secondary")
                      }
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {t("interviewQuestions.types." + q.type)}
                        </span>
                        <span
                          className={
                            "rounded-md border px-2 py-0.5 text-xs font-medium " +
                            DIFFICULTY_TONE[q.difficulty]
                          }
                        >
                          {t("interviewQuestions.difficulties." + q.difficulty)}
                        </span>
                      </span>
                      <span className="mt-2 block text-sm font-medium leading-6 text-foreground">
                        {t(base + ".text")}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BookOpenCheck className="size-3.5 shrink-0 text-cobalt" aria-hidden />
                        <span className="shrink-0">{t("interviewQuestions.list.sourceLabel")}</span>
                        <span className="truncate font-medium text-foreground">{t(base + ".source")}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title={t("interviewQuestions.detail.title")}>
          {loading ? (
            <div className="mt-4 space-y-3" aria-hidden>
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-20 w-full animate-pulse rounded bg-muted" />
              <div className="h-16 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : keyBase === null ? (
            <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t("interviewQuestions.detail.empty")}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {t("interviewQuestions.types." + selected.type)}
                  </span>
                  <span
                    className={
                      "rounded-md border px-2 py-0.5 text-xs font-medium " +
                      DIFFICULTY_TONE[selected.difficulty]
                    }
                  >
                    {t("interviewQuestions.difficulties." + selected.difficulty)}
                  </span>
                </div>
                <p className="mt-2 text-base font-semibold leading-7 text-foreground">{t(keyBase + ".text")}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(keyBase + ".description")}</p>
              </div>

              <div className="rounded-lg border border-border bg-secondary p-3">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">
                      {t("interviewQuestions.detail.resumeVersion")}
                    </dt>
                    <dd className="font-medium text-foreground">{t(keyBase + ".resumeVersion")}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">
                      {t("interviewQuestions.detail.resumeEntry")}
                    </dt>
                    <dd className="text-foreground">{t(keyBase + ".resumeEntry")}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <p className="text-xs font-semibold text-card-foreground">
                  {t("interviewQuestions.detail.evidenceLabel")}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {["e1", "e2", "e3"].map((evidence) => (
                    <li key={evidence} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
                      <span className="min-w-0">{t(keyBase + ".evidence." + evidence)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  aria-expanded={answerOpen}
                  onClick={() => setOpenAnswerKey(answerOpen ? null : selectedKey)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-card-foreground">
                    <Target className="size-4 shrink-0 text-cobalt" aria-hidden />
                    {t("interviewQuestions.detail.answerLabel")}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {answerOpen
                      ? t("interviewQuestions.detail.answerOpen")
                      : t("interviewQuestions.detail.answerClosed")}
                    {answerOpen ? (
                      <ChevronUp className="size-3.5" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden />
                    )}
                  </span>
                </button>
                {answerOpen ? (
                  <p className="border-t border-border px-3 py-2 text-xs leading-5 text-foreground">
                    {t(keyBase + ".answer")}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default QuestionsScreen
