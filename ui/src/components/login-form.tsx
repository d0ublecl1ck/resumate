// 登录 / 注册表单（表现层）。
// 原型 ui/prototypes/index.html 只覆盖首页，未定义登录页；这里沿用原型的设计令牌
// （card-frame、primary/coral/cobalt/gold、focus ring）与页面既有输入样式，
// 不引入新的视觉规范。登录页视觉待原型确认。

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

export type LoginMode = "login" | "register"

export interface LoginCredentials {
  email: string
  password: string
  displayName?: string
}

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"

export function LoginForm({
  mode,
  onModeChange,
  onSubmit,
  submitting = false,
  error = null,
  initialEmail = "",
  initialPassword = "",
  initialDisplayName = "",
}: {
  mode: LoginMode
  onModeChange: (mode: LoginMode) => void
  onSubmit: (credentials: LoginCredentials) => void
  submitting?: boolean
  error?: string | null
  initialEmail?: string
  initialPassword?: string
  initialDisplayName?: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState(initialPassword)
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const isRegister = mode === "register"

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ email: email.trim(), password, ...(isRegister ? { displayName: displayName.trim() } : {}) })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-[26rem] rounded-full bg-coral/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-32 top-1/3 size-[22rem] rounded-full bg-gold/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-[20rem] rounded-full bg-cobalt/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[3px_3px_0_var(--foreground)]">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-serif text-xl font-bold leading-none text-foreground">Resumate</span>
            <span className="block text-xs text-muted-foreground">对话式简历工作台</span>
          </span>
        </div>

        <form onSubmit={submit} noValidate className="card-frame p-6 shadow-[6px_6px_0_var(--foreground)]">
          <h1 className="font-serif text-2xl font-bold text-foreground">{isRegister ? "创建账号" : "登录 Resumate"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRegister ? "用邮箱注册，开始整理你的职业事实库。" : "用邮箱和密码继续你的求职准备。"}
          </p>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            {isRegister ? (
              <label className="block" htmlFor="login-name">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">昵称</span>
                <input
                  id="login-name"
                  name="displayName"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={submitting}
                  className={inputClass}
                />
              </label>
            ) : null}

            <label className="block" htmlFor="login-email">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">邮箱</span>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                className={inputClass}
              />
            </label>

            <div>
              <label className="block" htmlFor="login-password">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">密码</span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  aria-describedby={isRegister ? "login-password-hint" : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  className={inputClass}
                />
              </label>
              {isRegister ? (
                <span id="login-password-hint" className="mt-1 block text-xs text-muted-foreground">
                  至少 8 位字符。
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {submitting ? "处理中…" : isRegister ? "注册并登录" : "登录"}
          </button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isRegister ? "已经有账号？" : "还没有账号？"}
            <button
              type="button"
              onClick={() => onModeChange(isRegister ? "login" : "register")}
              disabled={submitting}
              className="ml-1 font-semibold text-cobalt hover:underline disabled:opacity-50"
            >
              {isRegister ? "去登录" : "去注册"}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
