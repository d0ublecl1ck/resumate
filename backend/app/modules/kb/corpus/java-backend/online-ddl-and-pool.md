# 在线 DDL 与连接池治理

## ALGORITHM 与 LOCK 三档

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

MySQL 在线 DDL 用 ALGORITHM 与 LOCK 声明期望：ALGORITHM=INSTANT 只改数据字典，秒级完成，8.0 支持加列、改默认值等；INPLACE 不拷贝整表，在原有表上重建二级索引或改索引，允许并发 DML；COPY 兜底，建临时表逐行拷贝，全程锁写。LOCK=NONE 允许并发读写，LOCK=SHARED 允许读、禁写，LOCK=EXCLUSIVE 读写都禁。执行时若声明与操作不兼容，会退化成更重的算法甚至报错，所以变更前要显式写出最低要求，先在预发演练，不要在生产裸跑 ALTER。

## gh-ost 与 pt-osc 影子表

gh-ost 与 pt-online-schema-change 都走影子表：建结构一致的新表，用 binlog 或触发器同步增量，再分批拷存量数据，最后短暂加锁 rename 切换。gh-ost 基于 binlog 复制，无触发器，对写入影响更小，可暂停和限流；pt-osc 用触发器，兼容性更广但有额外写放大。两者都需要足够的磁盘空间与权限，切换瞬间要拿 metadata lock，遇到长事务会被阻塞，因此切换前先处理长事务或改到低峰执行。

## DDL 期间的主从延迟与流量治理

大表 DDL 会产生大量 binlog，从库回放跟不上时 Seconds_Behind_Master 飙升；期间要监控延迟、用 gh-ost 的 --max-load 与 --critical-load 控制拷表速率，必要时暂停。业务侧要错峰，避免在 DDL 上叠加发布与压测；对读延迟敏感的场景走主库或降级缓存。DDL 工具本身要能中断和恢复，变更要有回滚预案：能反向执行的 DDL 直接回滚，不能的用备份加补偿脚本。

## 连接池与主从切换时的连接放大

连接池大小要按数据库 max_connections 倒推：实例数乘以每实例 maximumPoolSize 不能超过数据库承载，否则一次扩容就可能打死数据库。HikariCP 的关键参数是 maximumPoolSize、minimumIdle、connectionTimeout、maxLifetime、idleTimeout，maxLifetime 必须小于数据库 wait_timeout，避免用到被服务端断开的死连接。主从切换或数据库重启时旧连接批量失效，客户端若不做重建与重试，会出现大量 Connection reset 与请求失败，而连接建立风暴本身就是放大效应。要在池上配心跳校验、合理的获取超时与熔断，并让读操作在从库不可用时回退主库，写操作失败快速失败而不是无限重试。