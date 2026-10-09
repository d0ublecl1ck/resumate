# 浏览器渲染与事件循环

## 关键渲染路径

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

浏览器收到 HTML 后边解析边构建 DOM，遇到 CSS 构建 CSSOM，二者合成渲染树，再经过样式计算、布局（Layout，计算位置尺寸）、绘制（Paint，生成绘制指令）、合成（Composite，图层合成上屏）。布局、绘制、合成是三个成本递增递减的阶段：改变几何属性（width、height、top、left、margin）会触发重排 Layout，代价最高；改变颜色、背景等不影响布局的属性触发重绘 Paint；只改 transform、opacity 且提升为合成层时可以跳过布局与重绘，直接在合成阶段处理，因此位移动画推荐用 transform: translateX 而不是 top。will-change: transform 会提前创建合成层，减少动画开始时的抖动，但滥用会创建过多图层，占用显存并增加合成开销，动画结束应移除。

## 事件循环与任务调度

JavaScript 是单线程的，事件循环按「执行一个宏任务，再清空所有微任务」的节奏工作。宏任务包括整体脚本、setTimeout、setInterval、I/O、UI 渲染等，微任务包括 Promise.then、queueMicrotask、MutationObserver，微任务在当前宏任务结束前全部执行完，因此微任务里再排微任务会饿死渲染与用户输入。requestAnimationFrame 在下一帧渲染前执行，适合动画；requestIdleCallback 在浏览器空闲时执行低优先级任务。长任务会阻塞主线程，导致点击无响应、动画掉帧、INP 恶化，要用 Performance 面板识别超过 50ms 的任务并拆分，或用 Web Worker 把纯计算移出主线程。

## 布局抖动与合成

强制同步布局（layout thrashing）是指在一次循环里先读 offsetTop、getBoundingClientRect 等触发布局，再写样式使其失效，下一次读取又强制重新布局。正确做法是批量读、批量写，读写分离，或用 requestAnimationFrame 把写操作推迟到下一帧。合成层不是越多越好：层过多会带来内存与合成线程调度压力，尤其在低端机上适得其反。

## 观测手段

Performance 面板能看火焰图、帧率、长任务与各阶段耗时；PerformanceObserver 可以在线上采集 longtask、layout-shift、largest-contentful-paint 等条目；Chrome Tracing 与 Layers 面板可以观察合成层与光栅化。优化要以真实数据为准，不能只看实验室单机分数。