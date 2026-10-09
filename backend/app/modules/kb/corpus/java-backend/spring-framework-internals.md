# Spring 框架核心机制

## Bean 生命周期与三级缓存

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

Bean 生命周期顺序是：实例化 → 属性填充（依赖注入）→ Aware 回调 → BeanPostProcessor 前置处理 → 初始化方法（@PostConstruct、InitializingBean.afterPropertiesSet、init-method）→ BeanPostProcessor 后置处理（AOP 代理对象通常在这一步生成）→ 使用 → 销毁（@PreDestroy、DisposableBean、destroy-method）。理解这个顺序才能解释「注入的到底是原始对象还是代理对象」。

Spring 用三级缓存解决单例 Bean 的字段注入与 setter 注入循环依赖。一级缓存 singletonObjects 存放完整 Bean；二级 earlySingletonObjects 存放提前暴露的半成品；三级 singletonFactories 存放 ObjectFactory，在被其他 Bean 依赖时按需生成早期引用，AOP 场景下这一步产出的就是代理对象。构造器注入的循环依赖无法用三级缓存解决，会直接抛 BeanCurrentlyInCreationException；@Async 与 @Transactional 的代理提前暴露正是靠第三级缓存。

## AOP 代理与自调用失效

Spring AOP 默认两种代理：目标类实现了接口用 JDK 动态代理，否则用 CGLIB 生成子类。所有增强（@Transactional、@Async、@Cacheable、自定义切面）都只在「经过代理对象」的调用上生效。

同类内部方法互相调用（self-invocation）用的是 this，不经过代理，因此事务、异步、缓存注解全部失效，这是线上最常见的失效原因。解决办法有三种：把方法拆到另一个 Bean、注入自身代理后用代理调用、用 AopContext.currentProxy()（需开启 exposeProxy）。此外 private、final、static 方法不能被 CGLIB 覆写，代理对它们同样不生效。

## 事务传播与失效场景

传播行为决定方法被调用时如何对待已有事务：REQUIRED（默认，加入当前事务，无则新建）、REQUIRES_NEW（挂起当前事务，新开独立事务）、NESTED（用保存点嵌套，外层回滚会连带内层）、SUPPORTS、NOT_SUPPORTED、MANDATORY、NEVER。REQUIRES_NEW 常用于写日志、发消息这类不能随主事务回滚的动作，但要额外占用数据库连接。

事务失效的典型场景：同类自调用绕过代理；异常被 catch 后没有重新抛出；默认只对 RuntimeException 与 Error 回滚，抛出受检异常必须显式配置 rollbackFor；方法不是 public 时 JDK 代理不生效；数据库表使用不支持事务的引擎（如 MyISAM）；多数据源或异步线程里未指定事务管理器；以及事务尚未提交就跨线程读取数据。