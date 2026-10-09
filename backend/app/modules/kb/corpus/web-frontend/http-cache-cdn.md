# HTTP 缓存与 CDN 策略

## 强缓存与协商缓存

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

强缓存由 Cache-Control 的 max-age、s-maxage（共享缓存/CDN）、immutable 控制，命中后浏览器直接用本地副本，不发请求。协商缓存靠 ETag/If-None-Match 与 Last-Modified/If-Modified-Since，浏览器带着校验值请求，服务端返回 304 表示未变。Expires 是过时的绝对时间，受客户端时钟影响，应让位给 Cache-Control。no-cache 表示要协商后才能用，no-store 表示完全不允许缓存。前端资源的标准策略是内容哈希文件名加长强缓存（一年），HTML 用 no-cache 或短缓存，这样发版时新文件是新 URL，旧缓存不会串。

## 缓存位置与失效

缓存可能存在于内存缓存、磁盘缓存、Service Worker、CDN 边缘节点和反向代理。Service Worker 的更新要处理好版本与 activate 时清理旧缓存。CDN 策略要区分静态资源与接口：静态资源长缓存加文件名哈希，接口按业务设置 s-maxage 或 no-store；发布新版本时对 HTML 做 CDN 刷新或预热，对哈希资源无需刷新。命中率低要排查缓存键是否包含无关的查询参数或 cookie、TTL 是否过短、回源是否带了不该带的头。

## CDN 与协议

CDN 通过边缘节点就近响应、回源取内容来降低延迟和源站压力。要配置回源协议、回源 HOST、健康检查与故障切换，源站要有回源限速与防盗链。HTTP/2 提供多路复用、头部压缩、服务端推送（已弱化），HTTP/3 基于 QUIC 用 UDP 降低握手与队头阻塞，适合弱网。开启压缩（brotli/gzip）、TLS 会话复用与 OCSP stapling。

## 一致性与排查

缓存导致的问题是「用户看到旧页面/旧接口数据」，排查步骤：确认响应头 Cache-Control/ETag、确认中间是否有代理或 CDN 缓存、确认是不是 Service Worker 拦截、确认请求是否命中了错误的缓存键。修复以「可失效」为原则：给缓存加版本、缩短 TTL、提供主动刷新接口，而不是简单粗暴地全局 no-store，那会牺牲大量性能。