# Gateway 阻塞调用与响应式线程模型

## WebFlux 与 Netty EventLoop

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Spring Cloud Gateway 基于 WebFlux 与 Netty，请求由少量 EventLoop 线程处理，默认线程数约等于 CPU 核数。整个链路非阻塞：读取、写回、路由转发都注册回调，线程不会因等待 IO 而挂起，因此少量线程就能扛住很高并发。Gateway 的过滤器链（GlobalFilter、GatewayFilter）同样运行在 EventLoop 上，只要其中一段同步等待，占用的就是这个宝贵的 EventLoop。

## 阻塞调用的后果

在 GlobalFilter 里直接调用阻塞式 Redis（Jedis）、Feign、HttpURLConnection、JDBC 或 Thread.sleep，会让 EventLoop 线程被占住。EventLoop 数量少，几个慢调用就能把所有 EventLoop 打满，后续请求无论目标服务多健康都排不上队，表现为整网关假死、大面积超时，故障比单个路由失败严重得多。阻塞调用也不会触发背压，Netty 的读缓冲会持续堆积，内存上涨甚至 OOM。这与 Tomcat 每请求一线程、阻塞只影响单个请求完全不同，不能照搬 Servlet 的直觉。

## 正确改造方式

改造有三条：一是把阻塞调用切到弹性线程池，用 Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic()) 或 publishOn 隔离，boundedElastic 会为阻塞任务单独排队并限制并发，避免污染 EventLoop；二是换用响应式客户端，Redis 用 Lettuce 或 ReactiveRedisTemplate、HTTP 用 WebClient、数据库用 R2DBC，从根上非阻塞；三是把不适合放在网关的逻辑下沉到后端服务，网关只保留路由、鉴权、限流等轻量入口治理。超时要用 Reactor 的 timeout 算子声明，不能依赖客户端阻塞超时。上线前用压测验证：注入下游延迟，观察 EventLoop 线程状态与网关 RT，确认慢依赖不会拖垮整网关。