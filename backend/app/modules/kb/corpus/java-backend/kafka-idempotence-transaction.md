# Kafka 幂等与事务

## 生产者幂等

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

开启 enable.idempotence=true 后，Kafka 为生产者分配 PID，并为每个分区维护单调递增的 sequence number，broker 端按 (PID, 分区, 序列号) 去重，从而消除重试导致的重复写入。幂等要求 acks=all、retries 大于 0、max.in.flight.requests.per.connection 不超过 5（否则可能乱序）。注意幂等只保证单生产者单会话内不重复，生产者重启后 PID 变化，跨会话仍可能重复。

## 生产者事务与精确一次

事务在幂等基础上引入 transactional.id，通过 initTransactions、beginTransaction、commitTransaction/abortTransaction 把多个分区的写入和一个消费位点提交绑成一个原子单元，实现读-处理-写（read-process-write）的端到端精确一次。消费者要设 isolation.level=read_committed，才能只看到已提交事务的数据，未提交或已回滚的消息对它是不可见的。事务有超时和最大时长限制，长事务会带来性能与故障恢复代价，不适合把整个大批次塞进一个事务。

## 消费端幂等设计

即便 Kafka 内部做到精确一次，写外部系统（MySQL、Redis、下游接口）仍可能重复，所以消费端必须自己做幂等。常用手段：业务唯一键加唯一索引，重复插入直接冲突；状态机判断，只有处于预期前置状态的记录才允许推进；去重表或 Redis setnx 记录已处理的消息 ID，设置合理过期时间；以及把「扣减/入账」写成幂等表达式而不是自增。消费位点提交时机很关键：先处理业务再提交 offset 会产生重复（至少一次），先提交再处理会丢消息，多数业务选至少一次加幂等。

## 可靠性与积压

消息不丢需要三层配合：生产端 acks=all 且重试；broker 端副本因子不小于 3、min.insync.replicas 不小于 2、unclean.leader.election 关闭；消费端处理成功后再提交位点。消费积压先看是突发流量还是消费能力不足：可增加分区数与消费者并行度、提高单批拉取与处理批量、把下游慢调用改异步或加缓存；如果是某条消息反复失败，要把它投递到死信队列，避免阻塞整个分区。rebalance 会触发重复消费，要缩短单次处理时长并合理设置 session.timeout.ms 与 max.poll.interval.ms。