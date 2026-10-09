# 前端性能优化与 Core Web Vitals

## 核心指标

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Core Web Vitals 是 LCP、CLS、INP。LCP 衡量最大内容元素的渲染时间，代表加载性能；INP 衡量从用户交互到下一帧绘制的响应延迟，已取代 FID；CLS 衡量非预期布局偏移。辅助指标还有 TTFB、FCP、TTI。优化必须先有数据：实验室数据用 Lighthouse、Performance 面板，现场数据用 web-vitals 库加 PerformanceObserver 上报到 RUM，看 p75 而不是平均值，并按设备、网络、页面、版本维度拆开，Crux 与自建 RUM 口径不同要区分。对外承诺 SLO 用现场 p75，实验室分数只做回归门禁。

## LCP 与加载优化

LCP 可拆成四段：TTFB、资源加载延迟、资源加载时长、元素渲染延迟。对应手段：优化服务端与 CDN 降低 TTFB；对 LCP 图片用 preload 或 fetchpriority=high 提前发现，避免图片等到 JS 主 chunk 执行后才被 React 插入；用合适格式与尺寸（AVIF、WebP、srcset、响应式图片），避免大图拖慢；用 SSR、流式渲染、骨架屏与关键 CSS 内联缩短首屏；字体用 font-display 与 preload 避免文字延迟。注意 preload 必须和实际请求的 URL、as、crossorigin 完全一致，否则会重复下载。

## INP 与 CLS

INP 差通常因为长任务阻塞主线程：把大计算拆成小任务，用 scheduler.yield、requestIdleCallback、Web Worker 卸载，React 场景用 startTransition/useDeferredValue 把非紧急更新降优先级，避免一次同步 setState 触发上千行重渲染，长列表虚拟化。CLS 常见来源是图片与广告位未预留尺寸、字体切换、动态插入内容、异步加载的组件撑开布局；给图片和容器设宽高比或 min-height、用 font-size-adjust 或 fallback 字体匹配、把插入内容放到预留区域即可缓解。

## 观测与验证

性能优化要有前后对比与护栏指标：确定性场景用实验室数据，业务收益用灰度或 A/B 对照，不能直接拿优化前后的转化率比较，因为同时存在大促、版本、渠道等混淆因素。优化上线后持续监控 p75 与错误率，设置回归告警。指标口径要么与业务 SLO 对齐，要么明确只是工程内部参考。