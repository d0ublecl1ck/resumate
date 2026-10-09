# React 渲染原理与状态管理

## 渲染流程与 Fiber

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

React 的渲染分两个阶段：render 阶段调用组件得到新的元素树，与上一次的 Fiber 树做协调（reconcile），计算出需要变更的节点；commit 阶段把变更一次性提交到真实 DOM 并执行生命周期与 effect。React 16 把递归的 reconciler 改写成 Fiber 架构，每个 Fiber 节点就是一个可中断的工作单元，用链表串起父子与兄弟关系，从而支持时间切片、优先级调度和并发特性。旧的递归调用一旦开始就无法让出主线程，长组件树会阻塞交互；Fiber 让渲染可以暂停、恢复、丢弃，并用双缓存技术在当前树与工作树之间切换，保证用户永远看到完整的一帧。状态更新用 lane 模型标记优先级，紧急更新（输入、点击）可以插队到非紧急更新（数据刷新）之前。

## 组件渲染与状态来源

函数组件每次渲染都会重新执行整个函数，只有依赖变化才需要重算，useMemo/useCallback/React.memo 用于减少无谓计算与重渲染。状态来源包括 useState/useReducer 的组件内状态、Context 的跨层状态、以及外部 store（Redux、Zustand、Jotai）。选型要看数据特征：全局、可预测、需要时间旅行调试与中间件的用 Redux Toolkit；追求轻量、细粒度订阅、样板代码少用 Zustand；只做主题、语言、登录用户这类低频更新的用 Context，高频更新放 Context 会导致全树重渲染。

## 状态管理与渲染优化

状态要尽量下放到使用它的最近公共父节点，避免提升到顶层造成大面积重渲染。列表用稳定唯一的 key，不要用数组下标，否则插入删除会导致状态错位与多余渲染。长列表用虚拟化只渲染可视区域，避免一次挂载上千行同步 setState。用 selector 精确订阅需要的切片，避免订阅整个 store。批量更新在 React 18 中默认自动合并事件、Promise、setTimeout 里的 setState。

## 白屏与错误边界

Error Boundary 是唯一能捕获子树渲染期错误的机制，但它捕获不到事件处理器、异步回调、服务端渲染以及它自身的错误，也不处理 Promise 拒绝，需要配合 window.onerror 与 unhandledrejection 全局兜底。React.lazy 加 Suspense 加载子模块时，若 chunk 加载失败且没有错误边界接管会整页白屏，应给懒加载组件包错误边界并提供重试。排查白屏先用 Sources 断点与 sourcemap 还原堆栈，再检查根节点是否为空、是否在渲染中抛错、是否资源 404。