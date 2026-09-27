// i18n 入口：初始化 i18next，管理语言检测、切换与持久化，并同步 <html lang> 与文档标题。
// 组件统一通过 react-i18next 的 useTranslation() 读取 `<namespace>.<key>` 文案；
// 非 React 模块（lib/api.ts）直接使用这里导出的默认实例。
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en"
import zhCN from "./locales/zh-CN"

export const LOCALE_STORAGE_KEY = "resumate.locale"
export const DEFAULT_LOCALE = "zh-CN" as const

export const SUPPORTED_LOCALES = [
  { code: "zh-CN", labelKey: "common.language.zh-CN" },
  { code: "en", labelKey: "common.language.en" },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"]

export function isLocaleCode(value: unknown): value is LocaleCode {
  return SUPPORTED_LOCALES.some((locale) => locale.code === value)
}

function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** 语言检测顺序：本地持久化选择 → 浏览器语言 → zh-CN 兜底。 */
function detectLocale(): LocaleCode {
  const stored = readStoredLocale()
  if (isLocaleCode(stored)) return stored
  const browser = (typeof navigator === "undefined" ? "" : navigator.language).toLowerCase()
  if (browser.startsWith("zh")) return "zh-CN"
  if (browser.startsWith("en")) return "en"
  return DEFAULT_LOCALE
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
  },
  lng: detectLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES.map((locale) => locale.code),
  interpolation: { escapeValue: false },
  // 资源随包内置，无需异步加载，保证首屏即可同步读取译文。
  initAsync: false,
  react: { useSuspense: false },
})

function syncDocument(locale: string) {
  if (typeof document === "undefined") return
  document.documentElement.lang = locale
  document.title = i18n.t("common.appTitle")
}

i18n.on("languageChanged", syncDocument)
syncDocument(i18n.resolvedLanguage ?? i18n.language)

/** 当前生效语言（解析 regional variant 后）。 */
export function currentLocale(): LocaleCode {
  const active = i18n.resolvedLanguage ?? i18n.language
  return isLocaleCode(active) ? active : DEFAULT_LOCALE
}

/** 切换语言并持久化；切换结果同时驱动全站文案与后续 Agent 回复语言。 */
export function changeLocale(locale: LocaleCode): void {
  if (!isLocaleCode(locale)) return
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // 隐私模式下写入失败不阻断切换。
  }
  void i18n.changeLanguage(locale)
}

export default i18n
