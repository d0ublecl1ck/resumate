# 最小复现 D5：导入预览 React duplicate key

## 步骤
1. 浏览器登录隔离账号 -> /settings/backup
2. 上传 dupkey-backup.json（2 份同标题 Resume + 2 个同标题 JD，格式合法）
3. 预览弹窗渲染「将新增的资源」，控制台出现 duplicate key 警告

## 预期 / 实际
- 预期：允许同名资源的预览列表使用唯一 key，无 React 警告
- 实际：控制台出现 2 条 Encountered two children with the same key

## 根因
- ui/src/components/backup-panel.tsx:219 key={resource.type + resource.title} 在同名资源下不唯一

## 原始控制台（dupkey-console.log 摘录）
~~~
error: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. Resume重复标题-简历
error: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. JD同一公司 · 重复标题-岗位
~~~

## 截图
- <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/01-minimal-repro-dupkey.png

## 预览弹窗文案（前 200 字）
~~~
导入预览

格式 resumate-backup/1.0 · 简历 2 / 版本 0 / 个人资料 0 / 事实 0 / 岗位 2

将新增的资源

简历 · 重复标题-简历
简历 · 重复标题-简历
岗位 · 同一公司 · 重复标题-岗位
岗位 · 同一公司 · 重复标题-岗位

不会覆盖的现有资源

同名资源不会被合并或覆盖，导入始终创建新资源并重新映射 ID。

取消
确认导入为新资源
~~~