# @RefreshScope 动态刷新原理

## @RefreshScope 的作用域代理

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

@RefreshScope 本质是自定义作用域 refresh，底层是 GenericScope。标注的 Bean 会被包成作用域代理（ScopedProxyFactoryBean），注入到别处的是代理对象，真正实例缓存在作用域的目标缓存里。刷新时发布 EnvironmentChangeEvent 或调用 RefreshScope.refreshAll()，作用域销毁缓存中的目标实例，下一次方法调用由代理重新 getBean 创建，于是 @Value、@ConfigurationProperties 绑定到最新配置。它的语义是「销毁重建」，而不是就地修改字段。

## 配置加载优先级

Spring Boot 配置来源有优先级：命令行参数高于 Java 系统属性，高于操作系统环境变量，高于应用外部的 profile 配置，高于打包内的 application.yml；同名 key 高位来源覆盖低位来源。Spring Cloud 的 bootstrap 上下文先于 application 上下文加载，用于拉取远端配置。Spring Cloud 2020 之后 bootstrap 默认关闭，改用 spring.config.import=nacos: 或引入 spring-cloud-starter-bootstrap 显式开启。配置中心的 dataId、group、namespace 与本地配置共同决定最终 Environment。

## Nacos 配置监听与推送

Nacos 客户端启动时注册 Listener，用长轮询感知变更：客户端挂起请求约 30 秒，服务端在配置变更时立即响应，比纯定时拉取更实时，也避免频繁空转。收到新内容后触发 RefreshEvent，再由 RefreshScopeRefreshedEvent 通知各处刷新。Nacos 支持 beta 灰度发布与历史版本一键回滚，客户端侧可配本地快照目录，在配置中心不可用时退回本地缓存，保证启动可用。

## 动态刷新失效场景

常见失效场景有四种：一是对象已初始化且不重新读取配置的组件，如数据源连接池（HikariCP 或 Druid 的 url、账号、池大小）、线程池、Kafka 消费者、Netty 客户端，它们只在启动时装配，刷新 Environment 不会重建；二是 @RefreshScope 加在单例内部方法或 static 字段上无效，代理拦不到；三是类内自调用不走代理，刷新不生效；四是配置未纳入 Environment 或对应 dataId 未被监听。正确做法是把这类资源封装成带 @RefreshScope 的 @Bean 并暴露 destroyMethod，或用配置中心 SDK 监听后手动重建，不能指望改配置自动生效。