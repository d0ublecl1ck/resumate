# Spring Cloud Gateway 限流与灰度路由

## 网关定位与过滤器链

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Spring Cloud Gateway 是响应式网关，核心由 Route（id、目标 uri、断言 Predicate、过滤器 Filter）组成。请求先按 Predicate 匹配路由，再走过滤器链；GlobalFilter 与 GatewayFilter 通过 Ordered 的 order 值决定顺序，NettyRoutingFilter 负责真正转发，业务过滤器要排在其之前才能改写请求。常见的入口治理都在这一层：鉴权、灰度、限流、日志、跨域。

## 限流：令牌桶与 KeyResolver

Gateway 内置 RequestRateLimiter 过滤器，底层用 Redis 加 Lua 脚本实现令牌桶，参数是 replenishRate（每秒补充令牌数，即稳态 QPS）、burstCapacity（桶容量，允许的突发）、requestedTokens（单次消耗）。限流维度由 KeyResolver 决定，可按用户、IP、接口路径或组合键生成 key。网关通常多实例部署，必须把计数放到 Redis 集中存储，否则每台实例各自限流，集群总阈值被放大成实例数倍，这是最常见的线上事故来源。Redis 故障时要有兜底策略：要么快速失败保护后端，要么放行并告警，不能无限阻塞在 Redis 调用上。

## 灰度路由与元数据

灰度常用按请求头路由：Predicate 匹配 Header（如 x-version=beta）后转发到带 version=beta 元数据的实例；也可用 WeightCalculatorWebFilter 按权重百分比分流，权重从配置中心动态刷新。实例分组依赖注册中心的服务元数据或集群名，发布时先给灰度组打标，验证指标后再扩大权重。灰度必须能一键回滚，回滚动作是把权重调回零或删除灰度路由，而不是重新发版。

## 与 Sentinel 的分工

网关做入口的粗粒度限流，服务内部用 Sentinel 做细粒度保护。Sentinel 的流控模式有直接、关联、链路，流控效果有快速失败、Warm Up（冷启动预热）、排队等待；熔断降级按慢调用比例、异常比例或异常数触发，配合最小请求数、统计时长、熔断时长与半开探测。阈值不能拍脑袋，要基于压测得到的容量水位，并按集群实例数换算单机阈值。热点参数限流用于挡住某个商品或用户 ID 的突发流量。