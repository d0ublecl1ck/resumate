#!/usr/bin/env python3
"""extract-test-cases.py — 从仓库测试文件提取用例名，输出 Markdown 表格。

用途：把三层测试（后端 pytest / 运行体 pytest / 前端 vitest）的用例逐条列成
      「层级 | 模块 | 文件 | 用例名」表，供交付物 02-测试用例清单.md 使用。
用法：python3 docs/competition/zj-fwwb-2026/tools/extract-test-cases.py
输出：Markdown 到 stdout；末行打印 TOTAL_CASES=<n> 与 STORY_FILES=<n>。
口径：Python 只取 def test_*；前端只取 it(...) / test(...)（含 it.each / it.skip 这类点号变体）；
      .stories.tsx 是渲染用例载体，单列 story 文件计数，不计入用例表。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PY_RE = re.compile(r"^\s*def (test_[A-Za-z0-9_]+)\s*\(", re.M)
JS_RE = re.compile(r"""(?m)^[ \t]*(?:it|test)(?:\.\w+)?\(\s*(["'\x60])((?:(?!\1).)+)\1""")

rows = []


def add(layer, module, file_rel, names):
    for n in names:
        rows.append((layer, module, file_rel, n))


def scan_py(base, layer):
    for f in sorted((ROOT / base).rglob("test_*.py")):
        rel = f.relative_to(ROOT).as_posix()
        module = f.stem[len("test_"):] if f.stem.startswith("test_") else f.stem
        names = PY_RE.findall(f.read_text(encoding="utf-8", errors="ignore"))
        add(layer, module, rel, names)


def scan_js(base):
    files = sorted((ROOT / base).rglob("*.test.ts")) + sorted((ROOT / base).rglob("*.test.tsx"))
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        parent = f.parent.relative_to(ROOT / "ui/src").as_posix()
        module = parent if parent != "." else "(ui/src)"
        names = [m[1] for m in JS_RE.findall(f.read_text(encoding="utf-8", errors="ignore"))]
        add("前端 vitest", module, rel, names)


scan_py("backend/tests", "后端 pytest")
scan_py("agent-core/tests", "运行体 pytest")
scan_js("ui/src")

story_files = sorted((ROOT / "ui/src").rglob("*.stories.tsx"))

print("# 测试用例清单（脚本生成）")
print()
print("生成命令：python3 docs/competition/zj-fwwb-2026/tools/extract-test-cases.py")
print()
print("| 层级 | 模块 | 文件 | 用例名 |")
print("| --- | --- | --- | --- |")
for layer, module, rel, name in rows:
    print("| " + layer + " | " + module + " | " + rel + " | " + name + " |")
print()
counts = {}
for layer, _, _, _ in rows:
    counts[layer] = counts.get(layer, 0) + 1
for layer in sorted(counts):
    print("- " + layer + "：**" + str(counts[layer]) + "** 条")
print("- 前端 story 渲染文件（不计入用例表）：**" + str(len(story_files)) + "** 个")
print("- 用例总条数：**" + str(len(rows)) + "**")
print()
print("TOTAL_CASES=" + str(len(rows)))
print("STORY_FILES=" + str(len(story_files)))
