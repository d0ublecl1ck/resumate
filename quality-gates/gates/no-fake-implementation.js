// 项目门禁：伪实现 / 临时实现检测。
//
// 目标不是禁止临时实现，而是让每一个临时实现都被机器找得到、且写得足够详细。
// 含糊的散文式说明（「前端演示」「真实实现走」）正是漏检的根因：不可枚举。
//
// 规则一（结构化标记）：
//   生产代码里出现本仓库的含糊词汇（前端演示 / 真实实现走 / 示例草案 / 假数据 /
//   占位数据 / 暂时写死 / hardcoded demo ...）时，同一处必须有配套的合规标记：
//
//     // TODO(fake): <一句话摘要，必须在同一行>
//     //   真实实现: <真实现应当做什么>
//     //   影响: <用户会看到什么错误结果 / 缺什么>
//     //   出处: <issue id 或文档锚点>
//
//   - 没有配套标记 -> error（报出文件:行号 + 该模板）
//   - 标记存在但缺字段 -> error（标记不合格，点名缺哪个字段）
//   - 标记合规 -> 放行，但必须进入下方清单
//   - 普通 TODO/FIXME/XXX 明显在说「假 / 模拟 / demo / 暂」却没写成 TODO(fake): -> warning
//
// 规则二（声明接口与后端交叉核对）：
//   抽取前端注释与代码里的 METHOD /path 声明，与后端路由表比对。两侧都归一化路径
//   参数（花括号参数 / TS 模板串参数 / 冒号整段参数）。优先读 openapi 快照
//   （backend/openapi.json 或 OPENAPI_SNAPSHOT_PATH 指向的文件），拿不到就静态解析
//   backend/app/modules/**/api.py 的 APIRouter(prefix=...) 与 @router.* 装饰器。
//   缺失路由且路径根段是真实后端资源 -> error；根段不是后端资源（前端聚合、文档
//   漂移）或前缀解析不确定 -> console.warn，不失败，不制造假阳性。
//
// 清单（known stubs）：每次运行把全部合规 TODO(fake): 汇总打印到 stdout，固定前缀
//   「[no-fake-implementation] known stubs:」，字段为
//   「文件:行号 | 摘要 | 影响 | 出处 | 发现日期」。位置与字段即本文件与运行时输出，
//   一条命令即可回答「还有什么没做」：
//     node quality-gates/gates/no-fake-implementation.js <projectRoot>
//
// 豁免：路径级跳过测试 / story / mock / fixture（**/*.test.*、**/*.stories.*、
//   ui/src/mocks/**、*/fixtures/**、*/storybook/** 等）；行内 fake-allow 注释按
//   既有 privacy-allow / i18n-allow / form-allow / error-message-allow 同一约定豁免该行。
//
// 背景：ui/src/lib/api.ts 的 parseJdFromImage 注释自述前端演示、函数体是硬编码 demo，
//   且注释声明的 POST /jds:parse-image 后端根本不存在，两轮审计都没抓到。

import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const SCAN_DIRS = [join("ui", "src"), join("backend", "app")]
const SOURCE_FILE = /\.(ts|tsx|py)$/
const EXEMPT_FILE = /\.(test|spec|stories|story|fixture|mock)\./
const EXEMPT_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "storybook-static",
  "storybook",
  "tests",
  "test",
  "__tests__",
  "mocks",
  "__mocks__",
  "fixtures",
  "__fixtures__",
])
const LINE_ALLOW = "fake-allow"

// 仓库自己的含糊词汇；英文两项大小写不敏感。
const HONEST_MARKERS = [
  "此处为前端演示",
  "前端演示",
  "真实实现走",
  "示例草案",
  "假数据",
  "占位数据",
  "暂时写死",
  "硬编码演示",
  "demo data",
  "hardcoded demo",
]
const ASCII_MARKERS = new Set(["demo data", "hardcoded demo"])

const STUB_TAG = "TODO(fake):"
const STUB_FIELDS = ["真实实现", "影响", "出处"]
const STUB_WINDOW = 2
const MARKER_TEMPLATE = STUB_TAG + " <一句话摘要>\n  //   真实实现: <真实现应当做什么>\n  //   影响: <用户会看到什么错误结果>\n  //   出处: <issue id 或文档锚点>"
const GENERIC_TODO = /\b(TODO|FIXME|XXX)\b/
const FAKE_HINT = /假|模拟|demo|暂|mock|stub|占位/i
const COMMENT_CONTINUATION = /^\s*(\/\/|\*|\/\*|#)/

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
// 匹配注释或代码里的 METHOD /path 声明；路径字符集刻意收窄，避免吃进中文标点与正文。
const DECLARATION = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[A-Za-z0-9_\-/{}:.$]+)/g
const PARAM_TEMPLATE = /\$\{[^}]*\}/g
const PARAM_BRACE = /\{[^}]*\}/g
const PARAM_COLON = /\/:[A-Za-z_][A-Za-z0-9_]*/g

function stripQuery(path) {
  const index = path.indexOf("?")
  return index < 0 ? path : path.slice(0, index)
}

export function normalizePath(path) {
  let value = stripQuery(String(path).trim())
  value = value.replace(PARAM_TEMPLATE, "{}")
  value = value.replace(PARAM_BRACE, "{}")
  // 冒号参数只在整段出现时归一（/turns/:id/events），不碰 /jds:parse-text 这种动作后缀。
  value = value.replace(PARAM_COLON, "/{}")
  value = value.replace(/\/{2,}/g, "/").replace(/\/$/, "")
  return value.startsWith("/") ? value : "/" + value
}

function firstSegment(path) {
  const trimmed = path.replace(/^\//, "")
  const slash = trimmed.indexOf("/")
  const head = slash < 0 ? trimmed : trimmed.slice(0, slash)
  const colon = head.indexOf(":")
  return colon < 0 ? head : head.slice(0, colon)
}

// 反向约束不算伪实现：「绝不用假数据填充」是在禁止假数据，不是在承认假实现。
const NEGATION = /(绝不|不要|不用|不得|不能|不必|无需|禁用|禁止|拒绝|never|not |no )/i

function findHonestMarker(line) {
  const lower = line.toLowerCase()
  for (const marker of HONEST_MARKERS) {
    const haystack = ASCII_MARKERS.has(marker) ? lower : line
    const index = haystack.indexOf(marker)
    if (index < 0) continue
    if (NEGATION.test(haystack.slice(0, index))) continue
    return marker
  }
  return null
}

async function walk(dir, files) {
  if (!existsSync(dir)) return files
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXEMPT_DIRS.has(entry.name)) continue
      await walk(join(dir, entry.name), files)
    } else if (entry.isFile()) {
      files.push(join(dir, entry.name))
    }
  }
  return files
}

function isScannable(file, projectRoot) {
  const rel = relative(projectRoot, file).split(sep).join("/")
  return SOURCE_FILE.test(rel) && !EXEMPT_FILE.test(rel)
}

function fieldValue(line, label) {
  const match = line.match(new RegExp(label + "\\s*[:：]\\s*(.*)$"))
  return match ? match[1].trim() : ""
}

// 解析合规 TODO(fake): 块；返回块列表（含不合规问题）。
function parseStubBlocks(lines) {
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const index = lines[i].indexOf(STUB_TAG)
    if (index < 0) continue
    const block = {
      start: i,
      end: i,
      summary: lines[i].slice(index + STUB_TAG.length).trim(),
      fields: { 真实实现: "", 影响: "", 出处: "" },
      problems: [],
    }
    for (const label of STUB_FIELDS) {
      const sameLine = fieldValue(lines[i], label)
      if (sameLine) block.fields[label] = sameLine
    }
    let j = i + 1
    while (j < lines.length && COMMENT_CONTINUATION.test(lines[j])) {
      block.end = j
      for (const label of STUB_FIELDS) {
        const value = fieldValue(lines[j], label)
        if (value) block.fields[label] = value
      }
      j += 1
    }
    if (!block.summary) block.problems.push("摘要（必须与 " + STUB_TAG + " 同行）")
    for (const label of STUB_FIELDS) {
      if (!block.fields[label]) block.problems.push(label)
    }
    blocks.push(block)
    i = block.end
  }
  return blocks
}

async function collectBackendRoutes(projectRoot, warnings) {
  const routes = new Set()
  const roots = new Set()

  // 优先读 openapi 快照；拿不到再静态解析。
  const snapshotCandidates = [
    process.env.OPENAPI_SNAPSHOT_PATH,
    join(projectRoot, "backend", "openapi.json"),
    join(projectRoot, "quality-gates", "reports", "openapi.json"),
  ].filter(Boolean)
  for (const candidate of snapshotCandidates) {
    if (!existsSync(candidate)) continue
    try {
      const document = JSON.parse(await readFile(candidate, "utf8"))
      for (const [path, methods] of Object.entries(document.paths || {})) {
        for (const method of Object.keys(methods)) {
          const key = method.toUpperCase() + " " + normalizePath(path)
          routes.add(key)
          roots.add(firstSegment(normalizePath(path)))
        }
      }
      console.log("[no-fake-implementation] 路由表来源：openapi 快照 " + candidate)
      return { routes, roots, source: "openapi" }
    } catch (error) {
      warnings.push("[no-fake-implementation] 无法解析 openapi 快照 " + candidate + "：" + (error instanceof Error ? error.message : String(error)))
    }
  }

  const apiRoot = join(projectRoot, "backend", "app")
  const files = (await walk(apiRoot, [])).filter((file) => file.endsWith("api.py"))
  for (const file of files) {
    const text = await readFile(file, "utf8")
    const router = text.match(/APIRouter\(([^)]*)\)/)
    let prefix = ""
    if (router) {
      const parsed = router[1].match(/prefix\s*=\s*["\x27]([^"\x27]*)["\x27]/)
      if (parsed) prefix = parsed[1]
    }
    const decorator = /@router\.(get|post|put|patch|delete|head|options)\(\s*["\x27]([^"\x27]*)["\x27]/g
    let match
    while ((match = decorator.exec(text))) {
      const normalized = normalizePath(prefix + match[2])
      routes.add(match[1].toUpperCase() + " " + normalized)
      roots.add(firstSegment(normalized))
    }
  }
  // include_router 带前缀时静态解析会漏配，给出明确 warning 而不是假阳性。
  const included = await collectIncludePrefixes(projectRoot)
  for (const item of included) {
    warnings.push("[no-fake-implementation] main/app 里 include_router(" + item + ") 带非空前缀，静态解析无法把它映射回模块路由，相关路径比对可能不完整（无法判定）。")
  }
  console.log("[no-fake-implementation] 路由表来源：静态解析 backend/app/modules/**/api.py（未找到 openapi 快照）")
  return { routes, roots, source: "static" }
}

async function collectIncludePrefixes(projectRoot) {
  const candidates = [join(projectRoot, "backend", "app", "main.py")]
  const found = []
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const text = await readFile(file, "utf8")
    const regex = /include_router\(\s*[^,)]+,\s*prefix\s*=\s*["\x27]([^"\x27]+)["\x27]/g
    let match
    while ((match = regex.exec(text))) found.push(match[1])
  }
  return found
}

export async function analyzeProject(projectRoot) {
  const failures = []
  const warnings = []
  const stubs = []
  const backend = await collectBackendRoutes(projectRoot, warnings)
  const scanned = []

  for (const dir of SCAN_DIRS) {
    const files = (await walk(join(projectRoot, dir), [])).filter((file) => isScannable(file, projectRoot))
    scanned.push(...files)
    for (const file of files) {
      const rel = relative(projectRoot, file).split(sep).join("/")
      const text = await readFile(file, "utf8")
      const lines = text.split(/\r?\n/)
      const blocks = parseStubBlocks(lines)

      const covered = new Array(lines.length).fill(false)
      for (const block of blocks) {
        const from = Math.max(0, block.start - STUB_WINDOW)
        for (let k = from; k <= block.end; k += 1) covered[k] = true
        if (block.problems.length) {
          failures.push(
            "[no-fake-implementation] " + rel + ":" + (block.start + 1) + " TODO(fake) 标记不合格，缺少字段：" +
              block.problems.join("、") + " → 按下面模板补全（四项缺一不可）：" + MARKER_TEMPLATE,
          )
        } else {
          stubs.push({
            file: rel,
            line: block.start + 1,
            summary: block.summary,
            realImplementation: block.fields["真实实现"],
            impact: block.fields["影响"],
            source: block.fields["出处"],
          })
        }
      }

      lines.forEach((line, index) => {
        if (line.includes(LINE_ALLOW)) return
        if (!covered[index]) {
          const marker = findHonestMarker(line)
          if (marker) {
            failures.push(
              "[no-fake-implementation] " + rel + ":" + (index + 1) + " 命中伪实现词汇「" + marker +
                "」但没有配套的合规标记 → 临时实现必须写成结构化标记，模板：" + MARKER_TEMPLATE +
                "；确属 story/test/fixture/mock 请放到对应路径，确需保留请在该行加 " + LINE_ALLOW + " 注释并写明理由。",
            )
          }
        }
        if (GENERIC_TODO.test(line) && FAKE_HINT.test(line) && !line.includes(STUB_TAG)) {
          warnings.push(
            "[no-fake-implementation] " + rel + ":" + (index + 1) +
              " 普通 TODO/FIXME/XXX 在描述假实现，建议改写成 " + STUB_TAG + " 结构化标记，便于清单枚举。",
          )
        }
      })

      if (rel.endsWith(".py")) continue
      lines.forEach((line, index) => {
        if (line.includes(LINE_ALLOW)) return
        DECLARATION.lastIndex = 0
        let match
        while ((match = DECLARATION.exec(line))) {
          const method = match[1].toUpperCase()
          const declared = normalizePath(match[2])
          const key = method + " " + declared
          if (backend.routes.has(key)) continue
          if (backend.routes.has(method + " " + declared + "/{}")) continue
          if (backend.roots.has(firstSegment(declared))) {
            failures.push(
              "[no-fake-implementation] " + rel + ":" + (index + 1) + " 声明 " + key +
                "，后端路由表没有匹配 → 前端注释不能承诺不存在的端点：补后端路由，或改成真实调用的端点并同步注释；确属前端聚合/文档漂移请在该行加 " + LINE_ALLOW + " 注释并写明理由。",
            )
          } else {
            warnings.push(
              "[no-fake-implementation] " + rel + ":" + (index + 1) + " 声明 " + key +
                " 不在后端路由根集合内（可能是前端聚合或文档漂移），无法判定。",
            )
          }
        }
      })
    }
  }

  return { failures, warnings, stubs, scannedCount: scanned.length, routeSource: backend.source }
}

export async function check(projectRoot) {
  const result = await analyzeProject(projectRoot)
  const today = new Date().toISOString().slice(0, 10)
  for (const warning of result.warnings) console.warn(warning)
  if (result.stubs.length) {
    console.log("[no-fake-implementation] known stubs: " + result.stubs.length + "（文件:行号 | 摘要 | 影响 | 出处 | 发现日期）")
    for (const stub of result.stubs) {
      console.log("  " + stub.file + ":" + stub.line + " | " + stub.summary + " | " + stub.impact + " | " + stub.source + " | " + today)
    }
  } else {
    console.log("[no-fake-implementation] known stubs: 0")
  }
  return result.failures
}

// 直接执行本文件时作为独立命令运行：node quality-gates/gates/no-fake-implementation.js [projectRoot]
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  const root = process.argv[2] ? String(process.argv[2]) : PROJECT_DEFAULT
  const result = await analyzeProject(root)
  const today = new Date().toISOString().slice(0, 10)
  for (const warning of result.warnings) console.warn(warning)
  console.log("[no-fake-implementation] known stubs: " + result.stubs.length + "（文件:行号 | 摘要 | 影响 | 出处 | 发现日期）")
  for (const stub of result.stubs) {
    console.log("  " + stub.file + ":" + stub.line + " | " + stub.summary + " | " + stub.impact + " | " + stub.source + " | " + today)
  }
  if (result.failures.length) {
    console.log("[no-fake-implementation] failures: " + result.failures.length)
    for (const failure of result.failures) console.log("  " + failure)
    process.exitCode = 1
  } else {
    console.log("[no-fake-implementation] no failures.")
  }
}
