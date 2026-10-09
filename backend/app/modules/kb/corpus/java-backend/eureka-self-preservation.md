# Eureka 自我保护与服务摘除

## 自我保护机制与触发条件

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Eureka Server 以「最近一分钟实际收到的心跳数」与「期望心跳数」的比值判断是否触发自我保护。期望心跳数 = 注册实例数 × 每实例每分钟续约次数（默认 lease-renewal-interval-in-seconds=30，即每分钟 2 次）。当续约比例低于 renew-percent-threshold（默认 0.85）时，Server 进入自我保护模式，在保护期内不再剔除任何过期实例。

触发后的直接表现是 Eureka 控制台出现红色告警，实例列表不再收缩；已经宕机、网络分区或发布中下线的实例仍会留在注册表里被调用方拉取，上游于是持续出现连接超时、503 或重试放大。它的设计取向是可用性优先：宁可保留不可用实例，也不因网络抖动把健康实例大批误删。生产上如果网络稳定、希望故障实例尽快被摘除，可以关闭 enable-self-preservation，但必须接受抖动期误剔除的风险，并配合客户端超时与重试兜底。

## 与 Nacos 健康检查的差异

Eureka 只有客户端主动上报心跳、Server 被动接收这一条链路，没有服务端主动探测，因此是被动的、AP 模型。Nacos 把实例分成两类：临时实例（ephemeral=true）同样由客户端每 5 秒上报心跳，15 秒未收到标记不健康、30 秒未收到从列表剔除，走 Distro 协议；持久实例（ephemeral=false）由服务端按 TCP、HTTP 或 MySQL 主动探测，走 Raft 协议，属 CP 模型，故障时不会自动剔除。

感知速度也不同。Eureka 客户端靠定时拉取实例列表（registry-fetch-interval-seconds 默认 30 秒），叠加负载均衡本地缓存，变更最坏要一分钟以上才被调用方感知，且没有服务端推送；Nacos 有长连接与推送通道，配合注册中心的发布订阅，变更秒级可达。Eureka 2.x 已停止演进，新项目通常选 Nacos 或 Consul。

## 服务摘除与续约参数

服务端剔除逻辑受 lease-expiration-duration-in-seconds（默认 90 秒）与 eviction-interval-timer-in-ms（默认 60 秒）控制，因此关闭自我保护后，实例宕机到被摘除的最坏延迟约为 90 + 60 秒。客户端侧三个参数要一起看：心跳间隔 lease-renewal-interval-in-seconds、租约过期时间 lease-expiration-duration-in-seconds、拉取间隔 registry-fetch-interval-seconds。

灰度下线不要直接 kill 进程：先让实例进入 OUT_OF_SERVICE 或让健康检查失败，把流量摘走并等待存量请求处理完，再调用 deregister 或触发 shutdown hook 注销实例，避免请求被中断。还可用 eureka.client.prefer-same-zone-eureka 与 region、zone 元数据做同机房优先，降低跨机房调用延迟。