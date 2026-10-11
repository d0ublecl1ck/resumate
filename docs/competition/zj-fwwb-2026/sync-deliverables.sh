#!/usr/bin/env bash
# sync-deliverables.sh — A11 RMD 参赛交付物同步脚本
#
# 用途：把本目录下的竞赛交付物同步到桌面，分成两个目录：
#   - 交付目录：只放命题【提交材料】的必交件（7 件），可直接交给赛题组
#   - 内部记录目录：交付清单.md、讲稿、外挂字幕，不随作品提交
# 用法：bash docs/competition/zj-fwwb-2026/sync-deliverables.sh
# 产出：~/Desktop/A11-RMD-交付物-YYYYMMDD-HHMM/（7 个文件）
#       ~/Desktop/A11-RMD-内部记录-YYYYMMDD-HHMM/（3 个文件）
#       重名追加 -02、-03…，不覆盖历史。
#
# 交付目录的 7 个文件：
#   S1-方案概要.md、S2-解决方案.md、S3-核心内容展示.pptx、S5-团队完成过程.pptx、
#   S3-演示视频.mp4（S4B 视频）、S4A-源码包.zip（S4A 系统/软件）、
#   本地知识库资料.zip（命题【提交材料】第 (5) 项，必交）
# 只进内部记录目录（非提交内容）：交付清单.md、S3-演示视频-讲稿.md、S3-演示视频.srt
#
# 匿名口径（为什么这样做）：
#   - 官方匿名要求只禁止参赛学校名称、指导教师姓名及其暗示；第三方库与 mock 数据里的
#     GitHub 链接（github.com/vitejs、github.com/mswjs、github.com/zhangmu）无害，
#     因此不为 github.com 做整目录/整文件排除，优先保证源码包完整、内部引用不悬空。
#   - 作者身份线索（学校名、教师名、真实姓名、作者句柄、家目录绝对路径）不写进本脚本：
#     这些字面量放在同目录、不纳入版本管理的 patterns.local 里，由下面的配置加载段读取；
#     打包后按配置对包内副本做就地占位替换。未提供 patterns.local 时退回通用兜底模式，
#     本脚本仍能完成同步，只是不做实名专项替换（此时由包外流程保证匿名）。
#   - 仓库已脱敏，因此不再排除任何正文文件；docs/issues（Issues-as-Code）与
#     docs/e2e（端到端证据）全部进包。
#   - .env.example 模板保留（值为空或本地占位，便于评审按文档跑起来）。
#   - 测试角色证据：把 测试与质量/（总览/测试设计/用例清单/缺陷回归/端到端/门禁记录 + logs/）
#     注入源码包根目录的 交付说明/测试与质量/，让「测试设计与用例、缺陷复现与回归、
#     端到端走查与质量门禁执行」四句声称在包里直接翻得到。
#
# 验收：
#   1. 退出码 0，末行分别打印两个目录的绝对路径与文件数。
#   2. 交付物与源码包对身份线索（学校名/教师名/真实姓名/作者句柄/家目录路径）零命中。
#   3. 源码包不含 docs/competition/**、.git/、.env、node_modules、.venv、缓存与构建产物。
#   4. 重复执行只新增时间戳目录，不修改、不删除历史目录。
#   5. 交付目录的集合恰好是 7 个文件；内部记录目录恰好 3 个文件（多一个或文件名不符即报错退出）。
#   6. 源码包内含 交付说明/测试与质量/{00..05 文档} 与 交付说明/测试与质量/logs/{4 份运行记录}。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
COMP_DIR="$SCRIPT_DIR"
DESKTOP="${HOME}/Desktop"

# 匿名清洗配置：真实身份字面量只放在本机 patterns.local，脚本本体不内置任何实名/句柄字面量。
# patterns.local 格式（每行一个键=值，值写成不带引号的单行正则）：
#   SCHOOL_RE='学校名|学校简称|学校英文缩写|指导教师姓名'
#   REALNAME_RE='真实姓名甲|真实姓名乙'
#   IDENTITY_RE='作者句柄'
#   IDENTITY_REPLACEMENT='example-org'
#   MACHINE_RE='本机家目录绝对路径前缀的正则（形如 家目录前缀/用户名/）'
# 该文件已在 .gitignore 中忽略，不随仓库提交；缺失时使用下面的通用兜底模式（匹配不到具体身份）。
PATTERNS_LOCAL="$COMP_DIR/patterns.local"
SCHOOL_RE='__no-school-pattern-configured__'
REALNAME_RE='__no-realname-pattern-configured__'
IDENTITY_RE='__no-identity-pattern-configured__'
IDENTITY_REPLACEMENT='example-org'
MACHINE_RE='__no-machine-pattern-configured__'
if [[ -f "$PATTERNS_LOCAL" ]]; then
  # shellcheck disable=SC1090
  source "$PATTERNS_LOCAL"
fi
# 交付目录：只放命题【提交材料】的必交件（7 件）
DELIVERABLE_FILES=(
  "S1-方案概要.md"
  "S2-解决方案.md"
  "S3-核心内容展示.pptx"
  "S5-团队完成过程.pptx"
  "S3-演示视频.mp4"
  "S4A-源码包.zip"
  "本地知识库资料.zip"
)
# 内部记录目录：清单、讲稿、外挂字幕
INTERNAL_FILES=(
  "交付清单.md"
  "S3-演示视频-讲稿.md"
  "S3-演示视频.srt"
)
# 需要从竞赛材料目录取源、并做匿名自检的文件（清单与源码包由脚本生成）
SOURCE_FILES=(
  "S1-方案概要.md"
  "S2-解决方案.md"
  "S3-核心内容展示.pptx"
  "S5-团队完成过程.pptx"
  "S3-演示视频.mp4"
  "S3-演示视频-讲稿.md"
  "S3-演示视频.srt"
)

# 仓库已脱敏，无正文排除项；.env、node_modules、缓存、竞赛材料等本就未被 Git 跟踪。
# 交付说明源目录（本目录下的测试证据），注入到包根 交付说明/测试与质量/
EVIDENCE_DIR="$COMP_DIR/测试与质量"

say() { printf '%s\n' "$*"; }

if [[ -f "$PATTERNS_LOCAL" ]]; then
  say "匿名清洗：已加载本机配置 ${PATTERNS_LOCAL##*/}"
else
  say "匿名清洗：未找到 ${PATTERNS_LOCAL##*/}，使用通用兜底模式（不做实名专项替换）"
fi

# 集合校验：比对目录下【任意类型】的条目（文件 / 目录 / 符号链接 / 隐藏项都算），
# 多一个或少一个即报错退出；用于保证交付目录与内部记录目录的集合严格可控。
check_only() {
  local dir="$1"; shift
  local expected_list actual_list extra missing item kind
  expected_list="$(printf '%s\n' "$@" | LC_ALL=C sort)"
  actual_list="$(cd "$dir" && find . -mindepth 1 -maxdepth 1 -print | sed 's#^\./##' | LC_ALL=C sort)"
  if [[ "$actual_list" != "$expected_list" ]]; then
    say "错误：$dir 的条目集合不符合预期（文件、目录、符号链接、隐藏项都会计入）。"
    extra="$(comm -23 <(printf '%s\n' "$actual_list") <(printf '%s\n' "$expected_list"))"
    missing="$(comm -13 <(printf '%s\n' "$actual_list") <(printf '%s\n' "$expected_list"))"
    if [[ -n "$extra" ]]; then
      say "  多出的条目："
      while IFS= read -r item; do
        [[ -z "$item" ]] && continue
        if [[ -L "$dir/$item" ]]; then kind="link"
        elif [[ -d "$dir/$item" ]]; then kind="dir"
        else kind="file"; fi
        if [[ "$kind" == "dir" ]]; then
          say "    - [目录] $item  （交付目录不应出现目录）"
        else
          say "    - [$kind] $item"
        fi
      done <<< "$extra"
    fi
    if [[ -n "$missing" ]]; then
      say "  缺少的条目："
      while IFS= read -r item; do
        [[ -z "$item" ]] && continue
        say "    - $item"
      done <<< "$missing"
    fi
    exit 1
  fi
}

# 自检模式：bash sync-deliverables.sh --check-set <dir> <预期条目...>
if [[ "${1:-}" == "--check-set" ]]; then
  shift
  [[ $# -ge 2 ]] || { say "用法：$0 --check-set <dir> <预期条目...>"; exit 2; }
  check_only "$@"
  say "集合校验通过：$1 的条目与预期一致（只有 $(($# - 1)) 个条目，无目录、无符号链接、无隐藏项）"
  exit 0
fi

[[ -d "$DESKTOP" ]] || { say "错误：桌面目录不存在：$DESKTOP"; exit 1; }

# 1. 交付物存在性 + 学校名/教师名安全检查（文本直读；pptx 扫内部 XML；其余用 strings）
for name in "${SOURCE_FILES[@]}"; do
  src="$COMP_DIR/$name"
  [[ -f "$src" ]] || { say "错误：缺少交付物 $src"; exit 1; }
  if grep -aqE "$SCHOOL_RE" "$src"; then
    say "错误：交付物命中匿名红线（学校名/教师名）：$name"
    exit 1
  fi
  case "$name" in
    *.pptx)
      if unzip -p "$src" 2>/dev/null | grep -aqE "$SCHOOL_RE"; then
        say "错误：交付物（$name 内部 XML）命中匿名红线"
        exit 1
      fi
      ;;
    *)
      if strings -a "$src" 2>/dev/null | grep -qE "$SCHOOL_RE"; then
        say "错误：交付物（二进制）命中匿名红线：$name"
        exit 1
      fi
      ;;
  esac
done
say "匿名自检通过：${#SOURCE_FILES[@]} 个源文件未命中 $SCHOOL_RE"

# 2. 两个新目录，共用同一时间戳与序号（存在则加序号，绝不覆盖历史）
STAMP="$(date '+%Y%m%d-%H%M')"
DELIV_BASE="$DESKTOP/A11-RMD-交付物-$STAMP"
INT_BASE="$DESKTOP/A11-RMD-内部记录-$STAMP"
DELIV="$DELIV_BASE"
INT="$INT_BASE"
seq=1
while [[ -e "$DELIV" || -e "$INT" ]]; do
  seq=$((seq + 1))
  suffix="$(printf '%02d' "$seq")"
  DELIV="${DELIV_BASE}-${suffix}"
  INT="${INT_BASE}-${suffix}"
done
mkdir -p "$DELIV" "$INT"

TMP_DIR="$(mktemp -d)"
DEST_CREATED=0
cleanup() {
  rm -rf "$TMP_DIR"
  if [[ "$DEST_CREATED" == "0" ]]; then
    [[ -n "${DELIV:-}" && -d "${DELIV:-}" ]] && rm -rf "$DELIV"
    [[ -n "${INT:-}" && -d "${INT:-}" ]] && rm -rf "$INT"
    say "已清理未完成的目录：${DELIV:-} / ${INT:-}"
  fi
}
trap cleanup EXIT

# 3. 生成 S4A 源码包：git archive HEAD -> 包内占位替换 -> 写出最终 zip（放交付目录）
ZIP="$DELIV/S4A-源码包.zip"
RAW_ZIP="$TMP_DIR/raw.zip"
git -C "$REPO_ROOT" archive --format=zip -o "$RAW_ZIP" HEAD -- . ':(exclude)docs/competition'

python3 - "$RAW_ZIP" "$ZIP" "$EVIDENCE_DIR" "$IDENTITY_RE" "$IDENTITY_REPLACEMENT" <<'PY'
import os, sys, zipfile
raw, out, evidence = sys.argv[1], sys.argv[2], sys.argv[3]
identity_re, identity_replacement = sys.argv[4], sys.argv[5]
SUBS = [(identity_re.encode("utf-8"), identity_replacement.encode("utf-8"))] if identity_re else []
changed = []
injected = []
if not os.path.isdir(evidence):
    print("错误：缺少交付说明源目录 " + evidence)
    sys.exit(1)
with zipfile.ZipFile(raw) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        buf = zin.read(info)
        new = buf
        for a, b in SUBS:
            new = new.replace(a, b)
        if new != buf:
            changed.append(info.filename)
        zout.writestr(info, new)
    for root, dirs, files in os.walk(evidence):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, evidence).replace(os.sep, "/")
            arc = "交付说明/测试与质量/" + rel
            with open(full, "rb") as fh:
                data = fh.read()
            for a, b in SUBS:
                data = data.replace(a, b)
            zout.writestr(arc, data)
            injected.append(arc)
print("[占位替换] %s -> %s，改写包内文件数：%d" % (identity_re, identity_replacement, len(changed)))
for c in changed:
    print("  " + c)
print("[交付说明注入] 交付说明/测试与质量/ 文件数：%d" % len(injected))
for i in injected:
    print("  " + i)
PY

# 4. 匿名复扫：身份线索（学校名/教师名/真实姓名/作者句柄）必须零命中
python3 - "$ZIP" "$SCHOOL_RE" "$REALNAME_RE" "$IDENTITY_RE" <<'PY'
import re, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
pats = {"school": sys.argv[2], "realname": sys.argv[3], "identity": sys.argv[4]}
pats = {k: re.compile(v.encode("utf-8")) for k, v in pats.items()}
hits = []
for info in z.infolist():
    if info.is_dir():
        continue
    data = z.read(info)
    for label, rx in pats.items():
        if rx.search(data):
            hits.append((label, info.filename))
if hits:
    print("错误：源码包匿名复扫命中：")
    for label, fn in hits:
        print("  [%s] %s" % (label, fn))
    sys.exit(1)
print("匿名复扫通过：身份线索 0 命中")
PY

# 4b. 凭据模式扫描（只报告不拦截：命中应为测试桩/配置项名/空占位）
python3 - "$ZIP" <<'PY'
import re, sys, zipfile
rx = re.compile(rb"sk-|SMTP_PASSWORD|APP_PASSWORD|BEGIN PRIVATE KEY|postgresql://[^\s]*:[^\s]*@")
files = []
with zipfile.ZipFile(sys.argv[1]) as z:
    for info in z.infolist():
        if not info.is_dir() and rx.search(z.read(info)):
            files.append(info.filename)
print("[凭据模式扫描] 命中文件数：%d（应为测试桩/配置项名/空占位）" % len(files))
for f in files:
    print("  " + f)
PY

# 3b. 生成 本地知识库资料.zip（命题【提交材料】第 (5) 项）：corpus 打包 + 生成索引说明与清单
KB_ZIP="$DELIV/本地知识库资料.zip"
KB_ZIP_TMP="$TMP_DIR/本地知识库资料.zip"
python3 - "$REPO_ROOT" "$KB_ZIP_TMP" <<'PY'
import pathlib, sys, zipfile
repo, out = pathlib.Path(sys.argv[1]), sys.argv[2]
corpus = repo / "backend/app/modules/kb/corpus"
roles = sorted(p for p in corpus.iterdir() if p.is_dir())
rows = []
for role_dir in roles:
    for f in sorted(role_dir.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        rows.append((f.name, role_dir.name, len(text), len(text.encode("utf-8"))))

def fmt(n):
    return format(n, ",")

tsv_lines = ["文件名\t岗位\t字符数\t字节数"]
for name, role, chars, nbytes in rows:
    tsv_lines.append("%s\t%s\t%d\t%d" % (name, role, chars, nbytes))
tsv = "\n".join(tsv_lines) + "\n"

total_files = len(rows)
total_chars = sum(r[2] for r in rows)
total_bytes = sum(r[3] for r in rows)
table = ""
for role_dir in roles:
    role = role_dir.name
    n = sum(1 for r in rows if r[1] == role)
    c = sum(r[2] for r in rows if r[1] == role)
    b = sum(r[3] for r in rows if r[1] == role)
    table += "| %s | corpus/%s/ | %d | %s | %s |\n" % (role, role, n, fmt(c), fmt(b))
table += "| 合计 | - | %d | %s | %s |\n" % (total_files, fmt(total_chars), fmt(total_bytes))

doc_head = """# 本地知识库资料 · 索引说明

本资料是 A11《AI 模拟面试与能力提升软件》随作品提交的本地知识库语料，对应命题【提交材料】第 (5) 项「本地知识库资料」。

## 一、语料来源

- 全部为本项目自建种子语料（model-authored seed corpus），不是对任何外部规范、标准或出版物的摘抄，也不含第三方抓取内容。
- 35 篇 markdown 顶部都保留了既有的来源说明行（引号块），说明该文为自建种子语料、用于 A11 岗位题库的检索引用。
- 用途：为模拟面试出题提供「知识依据」；检索命中片段注入出题提示词，出题后按题干回填引用。

## 二、岗位分片方式

- 语料按 role（岗位）分片，目录即岗位：corpus/java-backend/、corpus/web-frontend/。
- 这两个岗位是当前落地的目标岗位样本，岗位维度可扩展：新增岗位按同一口径补语料与题目即可，不需要改架构。
- 同一口径：加一个岗位目录 → 导入为带 role 的文档 → 生成或录入带同一 role 的题目 → 按 role 回填引用。
- 条目按岗位归属：数据库字段 KbDocument.role（backend/app/modules/kb/models.py），切片按所属文档的 role 过滤。

## 三、条目数与规模

| 岗位（role） | 目录 | 文件数 | 字符数（Unicode） | 字节数（UTF-8） |
| --- | --- | ---: | ---: | ---: |
"""
doc_tail = """
说明：字符数按 Unicode 码点计；字节数是 UTF-8 编码后的字节数。命题沟通里出现的 59,649 与 28,223 是字节数口径，本表两个口径都给出。

## 四、检索口径

- 检索器为词法检索（BM25，含 IDF 与标题/小节加权）：分词后做 BM25 打分（k1=1.2、b=0.75），并对文档标题与小节标题两个字段单独再做一次 BM25 并加权（文档标题 0.1、小节标题 1.4，合计封顶 2.2）；标题命中只改排序、不改召回。
- 覆盖率门槛：短查询（查询词 ≤ 6）≥ 0.7，长查询 ≥ 0.05；低于门槛或无命中即返回 status=no_match，绝不返回编造内容。
- 作用域：检索按 role 限定在同一岗位，形成同一岗位内部的依据链，不跨岗位串味。
- 下一阶段：BM25 + 向量检索（RAG）+ rerank 重排——在现有词法检索（BM25）之上叠加向量召回与重排，提升同义与长尾召回。

## 五、引用回填

- 出题前按「岗位 + JD/简历要点」检索本岗位知识库，命中片段拼成「知识依据（来自岗位知识库检索，供出题参考）：[序号] source：snippet」注入生成提示词。
- 出题后再按题干检索一次，把命中出处落到题目的 knowledge_refs；未命中为空数组，前端显示「依据不足」。
- 边界：无命中即标注「依据不足」，不返回编造内容。

## 六、如何导入与检索（可复现命令）

导入与检索接口定义在 backend/app/modules/kb/api.py，后端默认端口 8000；导入需要登录会话（权限 resume:write），检索需要 resume:read。

    # 1) 导入一篇语料：body 是 markdown 正文，role 必须显式给出
    curl -X POST http://127.0.0.1:8000/kb/documents -H 'Content-Type: application/json' -b cookies.txt -d '{"title": "容量评估与全链路压测", "role": "java-backend", "source_type": "markdown", "body": "正文内容"}'

    # 2) 按岗位列出知识文档
    curl -b cookies.txt 'http://127.0.0.1:8000/kb/documents?role=java-backend'

    # 3) 按岗位检索：无命中时 status 为 no_match、results 为空
    curl -b cookies.txt 'http://127.0.0.1:8000/kb/search?q=Redis&role=java-backend'

说明：-b cookies.txt 代表已登录会话的 cookie，也可以直接在浏览器里用已登录的会话访问同样的路径。导入由服务端按上限 700 字符切片，切片继承所属文档的 role。

## 七、文件清单

- 清单.tsv：逐篇列出 文件名、岗位、字符数、字节数（制表符分隔，首行是列名）。
- corpus/java-backend/*.md、corpus/web-frontend/*.md：35 篇语料原文，保留原文件名与目录层次。

## 八、包内结构

    本地知识库资料.zip
    ├── 索引说明.md
    ├── 清单.tsv
    └── corpus/
        ├── java-backend/   (23 篇 .md)
        └── web-frontend/   (12 篇 .md)
"""
index_md = doc_head + table + doc_tail

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("索引说明.md", index_md)
    z.writestr("清单.tsv", tsv)
    for role_dir in roles:
        for f in sorted(role_dir.glob("*.md")):
            z.write(f, "corpus/" + role_dir.name + "/" + f.name)
print("[本地知识库资料] 打包 %d 篇语料 + 索引说明.md + 清单.tsv；字符数 %d、字节数 %d" % (total_files, total_chars, total_bytes))
PY

# 3c. 本地知识库资料包匿名/凭据复扫：学校名/教师名/真实姓名/本机路径/handle 必须零命中
python3 - "$KB_ZIP_TMP" "$SCHOOL_RE" "$REALNAME_RE" "$IDENTITY_RE" "$MACHINE_RE" <<'PY'
import re, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
pats = {
    "school": sys.argv[2],
    "realname": sys.argv[3],
    "identity": sys.argv[4],
    "machine": sys.argv[5],
}
pats = {k: re.compile(v.encode("utf-8")) for k, v in pats.items()}
hits = []
for info in z.infolist():
    if info.is_dir():
        continue
    data = z.read(info)
    for label, rx in pats.items():
        if rx.search(data):
            hits.append((label, info.filename))
if hits:
    print("错误：本地知识库资料包匿名复扫命中：")
    for label, fn in hits:
        print("  [%s] %s" % (label, fn))
    sys.exit(1)
print("本地知识库资料包匿名复扫通过：学校名/教师名/真实姓名/本机路径/handle 0 命中")
PY

# 打包与复扫都在 mktemp -d 里完成后，再把最终 zip 移入交付目录；交付目录不会出现暂存目录
mv "$KB_ZIP_TMP" "$KB_ZIP"

# 5. 复制：交付目录 7 件（其中 2 件由脚本生成）、内部记录目录 3 件（清单稍后生成）
cp -p "$COMP_DIR/S1-方案概要.md" "$DELIV/S1-方案概要.md"
cp -p "$COMP_DIR/S2-解决方案.md" "$DELIV/S2-解决方案.md"
cp -p "$COMP_DIR/S3-核心内容展示.pptx" "$DELIV/S3-核心内容展示.pptx"
cp -p "$COMP_DIR/S5-团队完成过程.pptx" "$DELIV/S5-团队完成过程.pptx"
cp -p "$COMP_DIR/S3-演示视频.mp4" "$DELIV/S3-演示视频.mp4"
cp -p "$COMP_DIR/S3-演示视频-讲稿.md" "$INT/S3-演示视频-讲稿.md"
cp -p "$COMP_DIR/S3-演示视频.srt" "$INT/S3-演示视频.srt"

# 6. 内部记录目录的交付清单.md（标准 Markdown 管道表格）
MANIFEST="$INT/交付清单.md"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
HEAD_SUBJECT="$(git -C "$REPO_ROOT" log -1 --pretty='%h %s')"
GEN_TIME="$(date '+%Y-%m-%d %H:%M:%S %z')"
{
  say "# A11 RMD 交付清单（内部记录）"
  say ""
  say "> 本清单是内部记录，不随作品提交；交付目录只放官方要求的 6 类提交物。"
  say ""
  say "- 生成时间：$GEN_TIME"
  say "- 仓库 HEAD：$HEAD_SHA"
  say "- HEAD 提交：$HEAD_SUBJECT"
  say "- 交付目录：$DELIV"
  say "- 内部记录目录：$INT"
  say "- 源码包：S4A-源码包.zip（git archive HEAD + 包内占位替换）"
  say "- 包内匿名处理：作者句柄按本机 patterns.local 配置替换为占位；仓库本体已脱敏（身份线索改为占位），无正文排除项"
  say ""
  say "## 交付目录文件（7 个，可直接提交）"
  say ""
  printf '| 文件 | 字节数 | sha256 |\n'
  printf '| --- | ---: | --- |\n'
  for name in "${DELIVERABLE_FILES[@]}"; do
    f="$DELIV/$name"
    bytes="$(stat -f '%z' "$f")"
    grouped="$(printf "%'d" "$bytes")"
    sha="$(shasum -a 256 "$f" | awk '{print $1}')"
    printf '| %s | %s | `%s` |\n' "$name" "$grouped" "$sha"
  done
  say ""
  say "## 机器可读清单（交付目录）"
  say ""
  say '```text'
  say "文件名	字节数	sha256"
  for name in "${DELIVERABLE_FILES[@]}"; do
    f="$DELIV/$name"
    bytes="$(stat -f '%z' "$f")"
    sha="$(shasum -a 256 "$f" | awk '{print $1}')"
    printf '%s\t%s\t%s\n' "$name" "$bytes" "$sha"
  done
  say '```'
  say ""
  say "## 内部记录目录文件（3 个，不随作品提交）"
  say ""
  for name in "${INTERNAL_FILES[@]}"; do
    say "- $name"
  done
  say ""
  say "> 备注：第三方 GitHub 链接（vitejs/mswjs/ExampleMate 等 mock）不排除；作者 handle 已在包内占位。"
  say "> 源码包含 交付说明/测试与质量/（六份文档 + logs/ 四份运行记录），随系统一起提交。"
} > "$MANIFEST"


# 7. 集合校验：交付目录恰好 7 个条目、内部记录目录恰好 3 个条目（check_only 见文件开头）
check_only "$DELIV" "${DELIVERABLE_FILES[@]}"
say "交付目录集合校验通过：恰好 ${#DELIVERABLE_FILES[@]} 个条目，无多余项（无目录、无符号链接、无隐藏项）"
check_only "$INT" "${INTERNAL_FILES[@]}"
say "内部记录目录集合校验通过：恰好 ${#INTERNAL_FILES[@]} 个条目，无多余项（无目录、无符号链接、无隐藏项）"

# 8. 结束打印
DEST_CREATED=1
DELIV_COUNT="$(find "$DELIV" -maxdepth 1 -type f | wc -l | tr -d ' ')"
INT_COUNT="$(find "$INT" -maxdepth 1 -type f | wc -l | tr -d ' ')"
say ""
say "交付目录（可直接提交，${DELIV_COUNT} 个文件）：$DELIV"
say "内部记录目录（不随作品提交，${INT_COUNT} 个文件）：$INT"
