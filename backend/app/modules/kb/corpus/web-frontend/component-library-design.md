# 组件库设计与按需加载

## API 与组件设计

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

组件库的 API 要一致、可预测：受控与非受控模式支持同一种用法，value 与 defaultValue 成对出现，变更统一走 onChange；需要操作 DOM 的场景用 forwardRef 透传 ref；组合优先于配置，用子组件与 children 表达结构而不是堆砌布尔 props。样式方案可选 CSS Modules、CSS-in-JS、Sass/Less 或原子化 CSS，关键是一致性与可主题化，通过设计令牌（颜色、间距、圆角、字体）驱动，避免业务侧用裸样式覆盖。组件要覆盖 loading、empty、error、disabled、focus 等状态，并默认具备可访问行为。

## 按需加载与摇树

业务方希望「用了哪个组件才引入哪个组件的样式」，实现方式是提供 ES Module 产物并在 package.json 声明 sideEffects，让打包器摇树；样式与组件一一对应并按 import 自动附带，或用 babel-plugin-import、unplugin 做编译期按需转换。要避免把整个组件库的样式打进首屏，也要避免每个组件单独一个 CSS 请求造成请求风暴。构建产物同时提供 esm 与 cjs、保留类型声明、把 React 等运行时列为 peerDependencies，防止多份 React 导致 hooks 报错。

## 版本与发布

组件库要有语义化版本与变更日志，破坏性变更给迁移指南和 codemod。发布流程包含构建、单测、视觉回归（截图对比）、可访问性检查与 Storybook 文档更新。多包仓库用 changesets 管理版本与发布，保证依赖版本一致。文档要能在本地跑起来，示例即测试。

## 治理与协作

组件库不是发布完就结束：要收集业务反馈、统计组件使用率与问题、定期清理废弃组件。公共组件改动会影响多个业务，改动要有影响面评估与灰度策略。组件拆分粒度按复用频率与耦合度决定，过度拆分会让业务组合成本变高。