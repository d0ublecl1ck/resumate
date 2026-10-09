# Tomcat 线程模型与连接治理

## Connector 的 Acceptor 与 Poller

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Tomcat 的 Connector 把网络接收与请求处理分开：Acceptor 线程在 ServerSocketChannel 上 accept 新连接，把 SocketChannel 注册到 Poller；Poller 线程用 NIO Selector 轮询就绪事件，读满请求行与请求头后，把 SocketProcessor 任务交给 Worker 线程池。NIO 下默认 1 个 Acceptor，Poller 数量约为 CPU 核数（pollerThreadCount）。请求解析、Servlet 执行与过滤器链都在 Worker 上，业务用 @Async 或 @Scheduled 又会让任务落到 Spring 的线程池，形成 Tomcat 线程池与业务线程池两级。

## Worker 线程池与队列

Worker 由 StandardThreadExecutor 承载，maxThreads 默认 200，minSpareThreads 默认 10，maxQueueSize 默认 Integer.MAX_VALUE，几乎无界。队列无界意味着压满 maxThreads 后请求不快速失败，而是在队列里排队，表现为 RT 持续上升直到超时。线上应把 maxQueueSize 设成有限值并配拒绝策略。Servlet 异步（AsyncContext）、WebSocket、SSE 会长期占用线程或连接，需要单独评估容量。

## maxThreads 与 acceptCount

acceptCount 是内核已完成三次握手但还没被 accept 的连接队列长度，默认 100，队列满后新连接被拒绝，客户端表现为连接超时或 reset。maxConnections 是 Tomcat 允许同时打开的连接上限，默认 8192，它和 maxThreads 是两回事：连接可以远多于线程，只要请求处理足够快。调参要基于压测，先压出 CPU 拐点，再定 maxThreads 与队列，不能只调大数值，否则把压力转成更长的排队与更高的 P99。

## 线程隔离与超时传播

网关和后端都要做线程隔离：入口用 Sentinel 或 Hystrix 的线程池隔离限制单个下游占用的线程数，避免一个慢依赖耗尽全部 Tomcat 线程导致整站不可用。超时要从入口一路传到底层：HTTP 客户端的 connectTimeout 与 readTimeout、数据库 socketTimeout、Redis 命令超时、MQ 消费超时，任何一环没有超时都会让上游线程挂死。还要给线程池设名称前缀，方便线程 dump 与监控。线上线程打满时，先 jstack 看线程卡在哪个下游，再决定扩容还是限流降级，而不是盲目调大 maxThreads。