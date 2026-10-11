// 门禁自测：node --test quality-gates/tests/no-fake-implementation.test.mjs
// 用临时 fixture 树证明两条规则的判定、豁免、warning 与清单输出。

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { analyzeProject, check, normalizePath } from "../gates/no-fake-implementation.js"

const NL = String.fromCharCode(10)

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "no-fake-"))
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, content, "utf8")
  }
  return root
}

function lines(...parts) {
  return parts.join(NL) + NL
}

const BACKEND_DEMO = lines(
  'from fastapi import APIRouter',
  'router = APIRouter(tags=["demo"])',
  '@router.get("/demo")',
  'def list_demo():',
  '    return []',
)

test("规则一：没有标记的含糊词汇报错，并给出文件:行号与模板", async () => {
  const root = await fixture({ "ui/src/lib/fake.ts": lines("// 前端演示：返回示例草案", "export const x = 1") })
  const result = await analyzeProject(root)
  assert.equal(result.failures.length, 1, JSON.stringify(result.failures))
  assert.match(result.failures[0], /ui\/src\/lib\/fake\.ts:1/)
  assert.match(result.failures[0], /TODO\(fake\):/)
  await rm(root, { recursive: true, force: true })
})

test("规则一：合规 TODO(fake) 四字段通过，并进入 known stubs 清单", async () => {
  const root = await fixture({
    "ui/src/lib/stub.ts": lines(
      "// TODO(fake): JD 截图识别仍是本地 stub",
      "//   真实实现: 调 POST /jds:parse-image 交给支持图像的模型",
      "//   影响: 上传截图后只按文件名返回示例草案",
      "//   出处: b6eab",
      "export function parseJdFromImage(): void {}",
    ),
  })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  assert.equal(result.stubs.length, 1)
  assert.equal(result.stubs[0].file, "ui/src/lib/stub.ts")
  assert.equal(result.stubs[0].line, 1)
  assert.match(result.stubs[0].impact, /示例草案/)

  const logs = []
  const original = console.log
  console.log = (...args) => logs.push(args.join(" "))
  try {
    await check(root)
  } finally {
    console.log = original
  }
  const text = logs.join(NL)
  assert.match(text, /known stubs: 1/)
  assert.match(text, /ui\/src\/lib\/stub\.ts:1/)
  await rm(root, { recursive: true, force: true })
})

test("规则一：标记缺字段报「标记不合格」并点名缺失字段", async () => {
  const root = await fixture({
    "ui/src/lib/bad.ts": lines("// TODO(fake): 只有摘要", "//   真实实现: 做真实现", "//   影响: 有影响", "export const x = 1"),
  })
  const result = await analyzeProject(root)
  assert.equal(result.failures.length, 1)
  assert.match(result.failures[0], /标记不合格/)
  assert.match(result.failures[0], /出处/)
  await rm(root, { recursive: true, force: true })
})

test("规则一：行内 fake-allow 豁免该行", async () => {
  const root = await fixture({ "ui/src/lib/ok.ts": lines("// 前端演示：假数据 fake-allow：这是门禁自测反例", "export const x = 1") })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  await rm(root, { recursive: true, force: true })
})

test("规则一：测试 / story / mock 路径豁免", async () => {
  const root = await fixture({
    "ui/src/lib/a.test.ts": lines("// 前端演示"),
    "ui/src/components/a.stories.tsx": lines("// 假数据"),
    "ui/src/mocks/handlers.ts": lines("// demo data"),
    "backend/app/modules/demo/tests/test_x.py": lines("# 前端演示"),
  })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  await rm(root, { recursive: true, force: true })
})

test("规则一：反向约束（绝不用假数据）不算伪实现", async () => {
  const root = await fixture({ "ui/src/features/voice.tsx": lines("// 录音不可用时降级为手动文本，绝不用假数据填充。", "export const x = 1") })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  await rm(root, { recursive: true, force: true })
})

test("规则一：普通 TODO 描述假实现给 warning，不失败", async () => {
  const root = await fixture({ "ui/src/lib/w.ts": lines("// TODO: 这里先用模拟数据占位", "export const x = 1") })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /建议改写成 TODO\(fake\):/)
  await rm(root, { recursive: true, force: true })
})

test("规则二：后端无此路由且根段是真实资源时报错", async () => {
  const root = await fixture({
    "backend/app/modules/demo/api.py": BACKEND_DEMO,
    "ui/src/lib/api.ts": lines("// POST /demo:missing —— 后端没有这个端点"),
  })
  const result = await analyzeProject(root)
  assert.equal(result.failures.length, 1, JSON.stringify(result.failures))
  assert.match(result.failures[0], /POST \/demo:missing/)
  assert.match(result.failures[0], /ui\/src\/lib\/api\.ts:1/)
  await rm(root, { recursive: true, force: true })
})

test("规则二：根段不是后端资源时只给 warning，不制造假阳性", async () => {
  const root = await fixture({
    "backend/app/modules/demo/api.py": BACKEND_DEMO,
    "ui/src/lib/api.ts": lines("// GET /workbench/summary —— 前端聚合"),
  })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /无法判定/)
  await rm(root, { recursive: true, force: true })
})

test("规则二：路径参数两侧归一化，且 APIRouter 前缀参与比对", async () => {
  const root = await fixture({
    "backend/app/modules/demo/api.py": lines(
      'from fastapi import APIRouter',
      'router = APIRouter(prefix="/demo", tags=["demo"])',
      '@router.get("/{demo_id}")',
      '@router.post("")',
      'def get_demo():',
      '    return {}',
    ),
    "ui/src/lib/api.ts": lines("// GET /demo/{id} —— 与后端 {demo_id} 同构", "// POST /demo —— 集合级建资源"),
  })
  const result = await analyzeProject(root)
  assert.deepEqual(result.failures, [], JSON.stringify(result.failures))
  await rm(root, { recursive: true, force: true })
})

test("normalizePath：花括号 / 模板串 / 冒号整段参数归一，动作后缀不动", () => {
  assert.equal(normalizePath("/demo/{id}"), "/demo/{}")
  assert.equal(normalizePath("/demo/" + "$" + "{id}"), "/demo/{}")
  assert.equal(normalizePath("/turns/:id/events"), "/turns/{}/events")
  assert.equal(normalizePath("/jds:parse-text"), "/jds:parse-text")
  assert.equal(normalizePath("/resumes/{id}/export?format=markdown"), "/resumes/{}/export")
})
