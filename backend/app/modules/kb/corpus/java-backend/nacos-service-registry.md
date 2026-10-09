# Nacos 服务注册与健康检查

## 注册模型与三级隔离

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Nacos 用 namespace、group、serviceName 三级结构做隔离：namespace 通常对应环境（开发、测试、生产），group 对应同一环境内的业务线或版本，serviceName 是服务名，集群 cluster 用于同城或同机房亲和。注册实例时还会带 ip、port、weight、metadata 和 ephemeral 标记。weight 影响客户端负载均衡的权重，metadata 常用来承载灰度版本、机房、单元化标签。多环境共用一套 Nacos 时，务必用 namespace 隔开，否则会出现测试流量打到生产实例的严重问题。

## 临时实例与持久实例

ephemeral=true 的临时实例由客户端主动上报心跳保活，默认 5 秒一次心跳，服务端超过 15 秒未收到心跳标记为不健康，超过 30 秒从实例列表剔除；这类实例走 Distro 协议，是 AP 模型，追求可用性与最终一致。ephemeral=false 的持久实例由服务端主动做健康检查，支持 TCP、HTTP、MySQL 等检查方式，走 Raft 协议，是 CP 模型，故障时不会自动剔除，需要人工或健康检查判定。生产上，能随进程消亡的普通 Spring Boot 服务用临时实例即可；托管在容器平台、需要自定义健康检查语义、或希望故障实例仍保留路由信息的场景才用持久实例。

## 配置中心与动态刷新

配置由 dataId、group、namespace 唯一定位，Spring Cloud Alibaba 用长轮询（约 30 秒一次挂起请求）感知变更，配合 @RefreshScope 或 @ConfigurationProperties 实现不重启刷新。配置里含数据库密码、密钥等敏感项时，要在客户端解密：常见做法是用 Jasypt 或自研加解密，Nacos 只存密文，密钥通过环境变量注入，绝不能把明文密钥提交进仓库。发布要利用 Nacos 的灰度（beta 发布）与历史版本回滚能力，先小流量验证再全量。

## 一致性与故障处理

Nacos 集群节点间要能互通 8848 与 7848 端口，否则 Raft 选主与 Distro 数据同步会异常。客户端要配置好 serverAddr 列表与容灾目录快照：本地缓存最后一次拉取到的实例列表，Nacos 全部不可用时仍能按快照兜底，避免服务间调用直接瘫痪。健康检查阈值、心跳间隔要与注册中心的网络抖动区分开，避免网络秒级抖动导致实例被大规模误剔除。