# MySQL 索引与慢查询

## 索引结构与回表

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

InnoDB 用 B+ 树，主键索引是聚簇索引，叶子节点存整行；二级索引叶子存主键值，按二级索引查不到需要的列时要拿主键回聚簇索引取整行，这叫回表。能靠二级索引直接返回所需列就是覆盖索引，避免回表是主要的索引优化手段。联合索引遵循最左前缀：WHERE a=? AND b=? AND c=? 能全用，(a,c) 只能用到 a；范围条件（>、<、BETWEEN）之后的列无法继续用于定位。索引下推（ICP）能把部分条件下推到存储引擎层过滤，减少回表次数。

## EXPLAIN 与索引失效

用 EXPLAIN 看访问类型 type，从好到差是 system、const、eq_ref、ref、range、index、ALL，出现 ALL 说明全表扫描。key 是实际使用的索引，key_len 反映用了几列，rows 是预估扫描行数，Extra 里 Using filesort、Using temporary 要重点处理，Using index 表示覆盖索引。常见的索引失效：列上套函数或运算、隐式类型转换（字符串列传数字）、LIKE 以 % 开头、OR 连接非索引列、联合索引违反最左前缀、范围条件阻断后续列。

## 慢查询定位

先开慢日志：slow_query_log=ON、long_query_time 设 1 秒或 0.5 秒、log_queries_not_using_indexes 按需。用 mysqldumpslow 或 pt-query-digest 聚合，按总耗时而不是单次耗时排序，因为高频小查询总代价可能更大。再看 performance_schema 或 sys schema 找 TOP SQL。定位后先看执行计划，再决定补索引、改写 SQL、拆分大查询还是加缓存。要区分偶发慢（锁等待、刷脏、网络）和稳定慢（缺索引、数据量增长）。

## 线上加索引与治理

大表直接 ALTER 会锁表阻塞写入，要用 online DDL（ALGORITHM=INPLACE, LOCK=NONE）或 gh-ost、pt-online-schema-change 这类工具做影子表切换。索引不是越多越好：每个索引都占空间、拖慢写入，要定期用 sys.schema_unused_indexes 清理无用索引。慢查询治理要形成闭环：慢日志采集、TOP SQL 看板、变更前后对比、回归验证，避免同一条 SQL 反复出问题。