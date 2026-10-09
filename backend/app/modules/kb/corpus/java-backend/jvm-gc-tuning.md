# JVM 内存与 GC 调优

## 运行时内存结构

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

JVM 运行时数据区包括堆、方法区（JDK8 起为元空间，使用本地内存）、虚拟机栈、本地方法栈、程序计数器。堆分新生代和老年代，新生代又分 Eden 与两个 Survivor（默认比例 8:1:1），对象优先在 Eden 分配，经历一次 Minor GC 存活的对象进入 Survivor 并年龄加一，达到阈值（默认 15）晋升老年代。大对象、长期存活对象、动态年龄判定都可能提前晋升。还有 TLAB 做线程本地分配缓冲减少竞争，逃逸分析可把未逃逸对象分配在栈上或直接标量替换，直接内存由 NIO 的 DirectByteBuffer 使用，不受堆大小限制但会 OOM。

## GC 算法与收集器

基础算法是标记-清除（有碎片）、标记-复制（新生代常用）、标记-整理（老年代常用）。Serial 适合小堆与客户端；Parallel Scavenge/Old 追求吞吐量，适合批处理；CMS 以最短停顿为目标但用标记-清除且并发失败会退化成串行 Full GC，JDK9 后废弃；G1 把堆切成 Region，按回收收益优先回收，通过 -XX:MaxGCPauseMillis 设定期望停顿，大对象走 Humongous Region；ZGC、Shenandoah 是低延迟收集器，停顿与堆大小基本无关，适合大堆与低延迟服务。

## 线上 Full GC 排查

先看 GC 日志和 jstat -gcutil：观察 Young GC 频率、每次回收后老年代占用是否持续上升、Full GC 后能不能降下来。如果 Full GC 后老年代几乎不降，基本是内存泄漏，用 jmap -histo 看对象排行，jmap -dump 后交给 MAT 分析支配树和 GC Roots 引用链。常见原因：静态集合长期持有、缓存无上限、ThreadLocal 未 remove、监听器未注销、元空间类加载泄漏、大量大对象、显式调用 System.gc。如果 Full GC 后能降下来只是频繁，多是新生代太小或晋升过快，调大新生代或 SurvivorRatio。调优先设 -Xms 与 -Xmx 相等避免堆动态伸缩，再设 -Xmn 或 NewRatio、MetaspaceSize、SurvivorRatio，配合 -XX:+HeapDumpOnOutOfMemoryError 留现场。

## 调优原则

GC 调优的目标是满足业务的延迟与吞吐指标，而不是追求零 Full GC。要先有监控与压测基线，再小步调整参数并观察，禁止在生产一次性改一堆参数。多数情况下，先定位代码里的对象分配与泄漏，比调收集器参数更有效。