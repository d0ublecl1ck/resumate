# 打包与产物优化

## 体积分析与依赖治理

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

先用可视化工具定位大头：webpack-bundle-analyzer、rollup-plugin-visualizer、source-map-explorer 能看到每个模块与依赖的体积。常见问题是重复依赖（同一库多个版本）、把整包 lodash 或整个组件库引进来、生产依赖带上了开发代码。解法是统一版本、锁版本或去重，按需引入（lodash-es 配合 tree-shaking，或 babel-plugin-import 做组件级按需），并在 package.json 声明 sideEffects=false 让打包器安全摇树。Tree-shaking 依赖 ES Module 的静态结构，CommonJS 代码无法被有效消除。

## 代码分割与首屏

按路由做动态 import 分包是性价比最高的手段，把首屏不需要的页面拆出去；对体积大的第三方库（图表、编辑器）单独拆 chunk 并懒加载。用 splitChunks 把稳定的第三方依赖单独分组，利用长缓存，业务代码改动不影响 vendor chunk 的缓存。首屏关键资源用 preload、modulepreload、prefetch 控制优先级，避免把非关键 chunk 提前拉取占带宽。React.lazy 加 Suspense 可以把组件级拆包，但不要把每个小组件都拆成独立 chunk，否则会出现几十个请求，HTTP/2 也扛不住过多小文件带来的调度与解析开销，应按路由或功能域聚合。

## 压缩与传输

JS/CSS 用 Terser 或 SWC 压缩、去掉 console 与 debugger，开启 gzip 与 brotli，静态资源上 CDN 并设置长缓存与内容哈希文件名。图片用现代格式与响应式尺寸，字体做子集化。服务端开启 HTTP/2 或 HTTP/3 多路复用，避免域名分片。构建产物中的 sourcemap 要上传到错误监控平台但不对公网暴露，或用 hidden-source-map。

## 工程化收尾

把体积预算写进 CI：超过阈值直接失败，避免体积悄悄膨胀。产物要有一致的目录结构与缓存策略，发布用内容哈希加 HTML 短缓存。构建提速手段包括持久化缓存（webpack cache、Vite 依赖预构建）、开启多线程与 SWC/esbuild、并行化与增量构建，但优化构建速度不能牺牲产物正确性，需有对比验证。