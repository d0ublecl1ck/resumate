// Epic 14 · US-14.1 根据简历生成面试题：题目真实来自建场次那一刻生成并落库的题目快照。
// 本屏读取真实场次（GET /interview/sessions + /{id}），「重新生成」走
// POST /interview/sessions/{id}/regenerate（已作答返回 409，映射成 i18n 文案）。
// 岗位 / 难度 / 题型筛选同步驱动重新生成参数；题目记录知识库命中的出处（依据）。
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, BookOpenCheck, Info, Library, RefreshCw, Sparkles, Target } from "lucide-react"
import { getInterviewSession, listInterviewSessions, regenerateInterviewSession } from "@/lib/interview"
import type { InterviewQuestionDifficulty, InterviewQuestionKind } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "./section-header"

// 四类可出题题型；situational 是 scenario 的历史别名，只从旧数据里读到，不作为筛选项。
const MAIN_KINDS: InterviewQuestionKind[] = ["technical", "deep_dive", "scenario", "behavioral"]
const DIFFICULTIES: InterviewQuestionDifficulty[] = ["easy", "medium", "hard"]

/** 历史 situational 与 scenario 同属一类；筛选与重新生成请求都按此归一。 */
function canonicalKind(kind: InterviewQuestionKind): InterviewQuestionKind {
  return kind === "situational" ? "scenario" : kind
}

function difficultyClass(value: InterviewQuestionDifficulty | null | undefined) {
  if (value === "hard") return "border-coral/40 bg-coral/5 text-coral"
  if (value === "medium") return "border-cobalt/40 bg-cobalt/5 text-cobalt"
  if (value === "easy") return "border-border bg-muted text-muted-foreground"
  return "border-border bg-muted text-muted-foreground"
}

function chipClass(active: boolean) {
  return (
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
    (active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")
  )
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  )
}

function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const fallback = t("interviewQuestions.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewQuestions.errors.${code}`, { defaultValue: "" }) || t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

export function QuestionsScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [role, setRole] = useState<string>("")
  const [kinds, setKinds] = useState<InterviewQuestionKind[]>([])
  const [difficulty, setDifficulty] = useState<InterviewQuestionDifficulty | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 已冻结筛选只在切换会话时回填一次，避免覆盖用户在当前会话里的选择。
  const seededSession = useRef<string | null>(null)

  const sessionsQuery = useQuery({ queryKey: ["interview", "sessions"], queryFn: () => listInterviewSessions() })
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const roles = useMemo(() => Array.from(new Set(sessions.map((session) => session.role))), [sessions])

  useEffect(() => {
    if (role === "" && roles.length > 0) setRole(roles[0])
  }, [role, roles])

  const session = useMemo(
    () => sessions.find((item) => item.role === role) ?? sessions[0] ?? null,
    [sessions, role],
  )
  const detailQuery = useQuery({
    queryKey: ["interview", "session", session?.id ?? ""],
    queryFn: () => getInterviewSession(session!.id),
    enabled: Boolean(session),
  })
  const detail = detailQuery.data
  const questions = detail?.questions ?? []

  useEffect(() => {
    if (!detail || seededSession.current === detail.id) return
    seededSession.current = detail.id
    const stored = detail.filters
    if (!stored) {
      setKinds([])
      setDifficulty(null)
      return
    }
    setKinds(stored.kinds.map(canonicalKind).filter((kind): kind is InterviewQuestionKind => MAIN_KINDS.includes(kind)))
    setDifficulty(stored.difficulty ?? null)
  }, [detail])

  const visible = useMemo(() => {
    if (kinds.length === 0) return questions
    const selected = new Set(kinds.map(canonicalKind))
    return questions.filter((question) => selected.has(canonicalKind(question.kind)))
  }, [questions, kinds])

  const selected = visible.find((question) => question.id === selectedId) ?? visible[0] ?? null

  const regenerate = useMutation({
    mutationFn: (id: string) =>
      regenerateInterviewSession(id, {
        ...(kinds.length > 0 ? { kinds } : {}),
        ...(difficulty ? { difficulty } : {}),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["interview", "session", data.id], data)
      void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] })
      setSelectedId(data.questions[0]?.id ?? null)
    },
  })

  function toggleKind(value: InterviewQuestionKind) {
    setKinds((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  function toggleDifficulty(value: InterviewQuestionDifficulty) {
    setDifficulty((prev) => (prev === value ? null : value))
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow={t("interviewQuestions.eyebrow")}
        title={t("interviewQuestions.title")}
        description={t("interviewQuestions.description")}
        actions={
          <>
            <Link
              to="/interview/setup"
              className="inline-flex items-center gap-2 rounded-lg border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-4" aria-hidden />
              {t("interviewQuestions.actions.generate")}
            </Link>
            <button
              type="button"
              onClick={() => session && regenerate.mutate(session.id)}
              disabled={!session || regenerate.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={"size-4 " + (regenerate.isPending ? "animate-spin" : "")} aria-hidden />
              {t("interviewQuestions.actions.regenerate")}
            </button>
          </>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <ChipGroup label={t("interviewQuestions.filters.position")}>
            {roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t("interviewQuestions.filters.noRole")}</span>
            ) : (
              roles.map((value) => (
                <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={chipClass(role === value)}>
                  {value}
                </button>
              ))
            )}
          </ChipGroup>

          <ChipGroup label={t("interviewQuestions.filters.difficulty")}>
            {DIFFICULTIES.map((value) => (
              <button key={value} type="button" aria-pressed={difficulty === value} onClick={() => toggleDifficulty(value)} className={chipClass(difficulty === value)}>
                {t("interviewQuestions.difficulties." + value)}
              </button>
            ))}
          </ChipGroup>

          <ChipGroup label={t("interviewQuestions.filters.type")}>
            {MAIN_KINDS.map((value) => (
              <button key={value} type="button" aria-pressed={kinds.includes(value)} onClick={() => toggleKind(value)} className={chipClass(kinds.includes(value))}>
                {t("interviewQuestions.types." + value)}
              </button>
            ))}
          </ChipGroup>

          <span className="text-xs text-muted-foreground">{t("interviewQuestions.filters.hint")}</span>
        </div>
      </Panel>

      {regenerate.isSuccess ? (
        <p className="flex items-center gap-2 rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-xs font-medium text-cobalt">
          <Info className="size-4 shrink-0" aria-hidden />
          {t("interviewQuestions.notice.regenerate")}
        </p>
      ) : null}
      {regenerate.isError ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
          {errorText(regenerate.error, t)}
        </p>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <Panel
          title={t("interviewQuestions.list.title")}
          caption={
            detailQuery.isPending
              ? t("interviewQuestions.status.loading")
              : t("interviewQuestions.status.resultMeta", { role: session?.role ?? "-", n: visible.length })
          }
        >
          {sessionsQuery.isPending || detailQuery.isPending ? (
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
          ) : sessionsQuery.isError || detailQuery.isError ? (
            <p className="mt-4 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
              {errorText(sessionsQuery.error ?? detailQuery.error, t)}
            </p>
          ) : sessions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-8 text-center">
              <p className="text-sm font-medium text-foreground">{t("interviewQuestions.list.noSession")}</p>
              <Link to="/interview/setup" className="mt-2 inline-flex text-xs font-medium text-cobalt">
                {t("interviewQuestions.list.createSession")}
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t("interviewQuestions.list.empty")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {visible.map((question) => {
                const active = selected?.id === question.id
                const refs = question.knowledgeRefs ?? []
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(question.id)}
                      className={
                        "w-full rounded-lg border p-3 text-left transition-colors " +
                        (active ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-secondary")
                      }
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {t("interviewQuestions.types." + question.kind)}
                        </span>
                        {question.difficulty ? (
                          <span className={"rounded-md border px-2 py-0.5 text-xs font-medium " + difficultyClass(question.difficulty)}>
                            {t("interviewQuestions.difficulties." + question.difficulty)}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {t("interviewQuestions.list.ordinal", { n: question.ordinal })}
                        </span>
                      </span>
                      <span className="mt-2 block text-sm font-medium leading-6 text-foreground">{question.prompt}</span>
                      {refs.length > 0 ? (
                        <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BookOpen className="size-3.5 shrink-0 text-cobalt" aria-hidden />
                          <span className="shrink-0">{t("interviewQuestions.list.basisLabel")}</span>
                          <span className="truncate font-medium text-foreground">{refs[0]}</span>
                        </span>
                      ) : (
                        <span className="mt-2 block text-xs text-muted-foreground">{t("interviewQuestions.list.basisEmpty")}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title={t("interviewQuestions.detail.title")}>
          {detailQuery.isPending ? (
            <div className="mt-4 space-y-3" aria-hidden>
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-20 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : !selected || !detail ? (
            <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t("interviewQuestions.detail.empty")}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {t("interviewQuestions.types." + selected.kind)}
                  </span>
                  {selected.difficulty ? (
                    <span className={"rounded-md border px-2 py-0.5 text-xs font-medium " + difficultyClass(selected.difficulty)}>
                      {t("interviewQuestions.difficulties." + selected.difficulty)}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {t("interviewQuestions.list.ordinal", { n: selected.ordinal })}
                  </span>
                </div>
                <p className="mt-2 text-base font-semibold leading-7 text-foreground">{selected.prompt}</p>
              </div>

              <div className="rounded-lg border border-border bg-secondary p-3">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">{t("interviewQuestions.detail.resumeVersion")}</dt>
                    <dd className="font-medium text-foreground">{detail.contextSnapshot.resumeTitle}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">{t("interviewQuestions.detail.targetRole")}</dt>
                    <dd className="text-foreground">
                      {detail.contextSnapshot.jdRole}
                      {detail.contextSnapshot.jdCompany ? " · " + detail.contextSnapshot.jdCompany : ""}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">{t("interviewQuestions.detail.rubric")}</dt>
                    <dd className="text-foreground">{detail.rubricVersion}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                  <Target className="size-4 shrink-0 text-cobalt" aria-hidden />
                  {t("interviewQuestions.detail.evidenceLabel")}
                </p>
                {selected.referencePoints.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("interviewQuestions.detail.evidenceEmpty")}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {selected.referencePoints.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
                        <span className="min-w-0">{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-card-foreground">
                  <Library className="size-4 shrink-0 text-cobalt" aria-hidden />
                  {t("interviewQuestions.detail.knowledgeLabel")}
                </p>
                {(selected.knowledgeRefs ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("interviewQuestions.detail.knowledgeEmpty")}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {(selected.knowledgeRefs ?? []).map((ref) => (
                      <li key={ref} className="flex items-start gap-2 text-xs leading-5 text-foreground">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
                        <span className="min-w-0">{ref}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.answer ? (
                <p className="inline-flex items-start gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground">
                  <BookOpenCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                  {t("interviewQuestions.detail.answered")}
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default QuestionsScreen
