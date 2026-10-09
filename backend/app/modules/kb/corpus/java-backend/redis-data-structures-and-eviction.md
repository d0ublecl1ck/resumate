# Redis 数据结构、编码与内存淘汰

## 五种基础结构与底层编码

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

String 的编码有 int（整数值）、embstr（不超过 44 字节的短字符串，一次分配）与 raw（长字符串）。Hash 在字段数少且值小时用 ziplist（Redis 7 起为 listpack）压成一段连续内存，超过 hash-max-listpack-entries（默认 128）或 hash-max-listpack-value（默认 64 字节）才转哈希表。List 在 7.0 起统一为 listpack 组成的 quicklist。Set 全为整数且元素少时用 intset，否则 hashtable。ZSet 成员少时用 listpack，超过 zset-max-listpack-entries（默认 128）或 member 超过 64 字节转 skiplist 加哈希表，skiplist 支撑范围查询与 O(logN) 定位。

## 内存估算与内存碎片

内存按 key 开销、编码结构开销、值三部分估：一个 key 除 SDS 字符串外还有 dictEntry、redisObject 等固定开销，几十到上百字节。用 INFO memory 看 used_memory、used_memory_rss 与 mem_fragmentation_ratio；ratio 明显大于 1 说明碎片偏高，可用 activedefrag 在线整理。分片集群还要按 slot 与节点估算单实例内存，用 --bigkeys、MEMORY USAGE 定位大对象。

## 过期删除：惰性删除与定期删除

Redis 对过期键采用惰性删除加定期删除。惰性删除在访问 key 时才检查 expires 字典里的时间戳，过期就删除并返回 nil；好处是不浪费 CPU，坏处是不被访问的过期键长期占用内存。定期删除由 serverCron 每 100ms 触发，从各 db 的 expires 字典随机抽样 20 个键，删除其中已过期的，若过期比例超过 25% 就继续抽样，单次有 CPU 时间上限，避免阻塞主线程。主从与 AOF 有差异：从库不主动删过期键，等主库的 DEL 同步过来。

## maxmemory-policy 八种淘汰策略

内存达到 maxmemory 后按 maxmemory-policy 处理，共八种：noeviction 不淘汰、写入直接报错；volatile-lru、volatile-lfu、volatile-ttl、volatile-random 只在设了过期时间的键里按 LRU、LFU、剩余 TTL、随机淘汰；allkeys-lru、allkeys-lfu、allkeys-random 在全部键范围内按 LRU、LFU、随机淘汰。纯缓存场景用 allkeys-lru 或 allkeys-lfu，混存持久数据用 volatile-* 防止误删。近似 LRU 只随机采样 maxmemory-samples（默认 5）个键挑最久未用的，不维护全局链表，省内存；LFU 用 8 位计数器加衰减，适合热点稳定但访问稀疏的场景。线上还要治理 bigkey 与 hotkey：bigkey 拆分并用 UNLINK 异步删，hotkey 用本地缓存、增加副本或读写分离。