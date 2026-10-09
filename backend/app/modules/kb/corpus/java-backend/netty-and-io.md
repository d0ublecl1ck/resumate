# Netty 线程模型与零拷贝

## Reactor 线程模型与 EventLoop

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Netty 采用主从 Reactor 多线程模型：BossGroup 负责 accept 连接，WorkerGroup 的数量默认为 CPU 核数的两倍，负责 read、write 以及解码、编码与业务 handler 的执行。每个 EventLoop 绑定一个线程并持有一个 Selector，可以服务多个 Channel；一个 Channel 只注册到一个 EventLoop，因此同一个 Channel 上的 handler 天然串行执行，不需要对 Channel 状态加锁。

这条规则的代价是：任何耗时的业务处理都会阻塞该 EventLoop 上的所有 Channel，表现为响应变慢甚至超时。正确做法是把阻塞调用、数据库查询、RPC 等丢到独立的业务线程池（自定义 ExecutorGroup 或 DefaultEventExecutorGroup），handler 中只做轻量的编解码与转发。

## ChannelPipeline 与背压

ChannelPipeline 是 ChannelHandler 的责任链：入站事件沿 Head 到 Tail 传播，出站事件沿 Tail 到 Head 传播。ctx.channel().write() 从 Tail 开始，ctx.write() 从当前 handler 之后的出站 handler 开始，传播起点不同是写出顺序问题的根源。ByteToMessageDecoder 负责处理 TCP 粘包与拆包，标记 @Sharable 的 handler 必须无状态，否则并发下状态会串。

背压靠 Channel.isWritable() 与 writabilityChanged 事件实现：出站缓冲 ChannelOutboundBuffer 超过 writeBufferHighWaterMark（默认 64KB）时变为不可写，回落到 lowWaterMark（32KB）以下恢复。写不进去时不能继续无脑 writeAndFlush，应暂停读取（autoRead=false）或对上游限流，否则缓冲持续膨胀直至 OOM。每次写都要用 ChannelFuture 监听失败并记录。

## 零拷贝与写缓冲

Netty 的零拷贝分几层：CompositeByteBuf 把多个缓冲区拼成逻辑整体而不做内存拷贝；slice 与 duplicate 共享底层内存；FileRegion 与 FileChannel.transferTo 走 sendfile 省去用户态拷贝；DirectByteBuf 使用堆外直接内存，减少一次 JVM 堆到内核的拷贝。代价是堆外内存必须正确释放，引用计数归零才会回收，解码与传递引用时要注意所有权，避免内存泄漏。

写缓冲和流量控制要一起调：SO_BACKLOG 决定 accept 队列长度，TCP_NODELAY 关闭 Nagle 降低小包延迟，SO_SNDBUF 与 SO_RCVBUF 影响吞吐。网关场景下还要配合连接池与超时（connect-timeout、response-timeout），当下游变慢时通过背压把压力挡在上游，而不是让缓冲无限增长。