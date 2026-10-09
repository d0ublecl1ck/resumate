# Java 并发与线程池

## 线程池核心机制

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

ThreadPoolExecutor 的关键参数是 corePoolSize、maximumPoolSize、workQueue、keepAliveTime、threadFactory 和 handler。执行流程是：核心线程未满就新建核心线程；核心线程满则入队；队列满才创建非核心线程直到 maximumPoolSize；再满则触发拒绝策略（AbortPolicy 抛异常、CallerRunsPolicy 由提交线程执行、DiscardPolicy、DiscardOldestPolicy）。最容易踩的坑是用无界队列（LinkedBlockingQueue 不传容量），导致 maximumPoolSize 永远不生效、任务无限堆积最终 OOM。正确做法是有界队列加明确的拒绝策略，并把拒绝与熔断降级联动。线程数没有万能公式：CPU 密集型约为核数加一，IO 密集型可用 核数 × (1 + 等待时间/计算时间) 估算，最终靠压测校准。线程池要按业务隔离，别让一个慢下游拖垮全部任务，并支持运行时动态调参（setCorePoolSize）配合配置中心灰度。

## 锁与内存可见性

synchronized 经过偏向锁、轻量级锁、重量级锁的升级过程（高版本 JDK 已弱化偏向锁），是可重入的非公平锁；ReentrantLock 基于 AQS，支持公平锁、可中断、超时、多条件变量，适合需要这些能力的场景。volatile 保证可见性与有序性但不保证原子性；CAS 通过 CPU 原子指令实现无锁更新，但存在 ABA 问题，可用 AtomicStampedReference 加版本号，且高竞争下自旋会空耗 CPU，LongAdder 分段累加优于 AtomicLong。happens-before 是判断跨线程可见性的规则，包括程序顺序、监视器锁、volatile 写读、线程启动与终止、传递性。

## 死锁与线程池监控

死锁的四个必要条件是互斥、持有并等待、不可抢占、循环等待，破坏任一即可预防，实践中最有效的是统一加锁顺序和用 tryLock 带超时。线上用 jstack 看是否有 Found one Java-level deadlock。线程池要暴露 activeCount、queueSize、completedTaskCount、拒绝次数等指标，队列持续增长或拒绝数上升就是容量告警。ThreadLocal 的 key 是弱引用而 value 是强引用，线程池线程长期存活时若不 remove 会内存泄漏，用完必须清理。