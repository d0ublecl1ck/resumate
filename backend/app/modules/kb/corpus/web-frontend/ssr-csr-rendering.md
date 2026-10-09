# SSR、CSR 与首屏渲染

## 渲染模式对比

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

CSR 由浏览器下载 JS 后渲染，首屏依赖 JS 下载执行，TTFB 低但 FCP/LCP 慢，SEO 弱。SSR 在服务端把 HTML 拼好返回，首屏内容更快可见、利于 SEO，但要付出服务端渲染成本与同构复杂度。SSG 在构建期生成静态 HTML，适合内容稳定页面；ISR 在 SSG 基础上支持增量再生成。流式 SSR 可以边渲染边发送，让上方内容更早到达，配合 Suspense 做分块注水。选择取决于内容动态性、首屏要求、SEO 与运维成本。

## 水合与一致性

SSR 返回 HTML 后，客户端要执行 JS 给 DOM 绑定事件，这一步叫水合（hydration）。水合要求服务端与客户端首次渲染结果一致，时间、随机数、浏览器 API、本地存储等差异会导致 hydration mismatch，轻则警告重渲染，重则内容闪烁或事件失效。解决办法是避免在首屏渲染依赖客户端状态，把不稳定数据放到 useEffect 里更新，或用 suppressHydrationWarning 谨慎处理。水合期间主线程被占用仍会阻塞交互，要控制首屏 JS 体积并支持渐进式水合。

## 首屏退化排查

从 SSR 改 CSR 后 LCP 明显变差，典型原因是 HTML 不再包含内容、LCP 元素要等 JS 执行才出现。排查用 Performance 面板看 LCP entry 的 startTime 与 FCP、TTFB 的关系：如果 TTFB 正常而 LCP 远大于 FCP，说明内容或 LCP 资源被 JS 延迟了。优化手段：恢复关键内容 SSR、对 LCP 图片 preload、减少阻塞脚本、把首屏切分成可独立渲染的块。注意 preload 与实际请求 URL、as 类型、crossorigin 必须匹配，否则反而重复下载。

## 缓存与部署

SSR 页面要处理缓存策略：个性化页面不能用共享缓存，公开页面可用 CDN 缓存并设 s-maxage，或用 stale-while-revalidate 兼顾速度与新鲜度。SSR 服务要有降级：渲染超时或报错时返回 CSR 壳或静态兜底页，不能整个站点 500。部署要预热、灰度并监控渲染耗时与错误率。