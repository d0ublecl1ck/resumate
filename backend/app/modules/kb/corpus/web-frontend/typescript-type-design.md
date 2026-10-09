# TypeScript 类型设计

## 类型系统基础

> 本文是 resumate 项目自建的种子知识语料（model-authored seed corpus），用于 A11 岗位题库的检索引用，非对任何外部规范、标准或出版物的摘抄。

TypeScript 是结构化类型系统，只看形状不看名义。类型收敛的目标是让非法状态在编译期不可表达：用字面量联合类型代替 string，用可辨识联合加 switch 穷尽检查代替多个可空字段，用 never 保证分支穷尽。unknown 是安全的顶层类型，使用前必须先收窄；any 会关闭后续所有检查并向外扩散，应尽量避免。JSON.parse、第三方回调、事件对象的 data 等来源都返回 any，应立刻标注为 unknown，再用类型守卫、zod 等运行时校验收窄到具体类型后再取嵌套字段。

## 泛型与高级类型

泛型用于在保持类型信息的前提下复用逻辑，约束用 extends。条件类型配合 infer 可以从类型中提取部分信息（如 ReturnType、Parameters 的原理），映射类型可以基于已有类型批量生成新类型，模板字面量类型可以表达字符串模式，例如把 'click' | 'hover' | 'focus' 映射成以 on 开头的处理器键：用 Capitalize 加模板字面量构造键名，再用 Record 或映射类型生成 HandlerMap。内置工具类型 Partial、Required、Readonly、Pick、Omit、Record、Exclude、Extract、NonNullable 能覆盖大多数字段变换。

## strict 模式与迁移

strict 打开后包含 strictNullChecks、noImplicitAny、strictFunctionTypes、strictPropertyInitialization 等。新项目应直接全开；存量项目迁移要分步：先开 noImplicitAny 补注解，再开 strictNullChecks 处理 null/undefined，配合 ESLint 的 no-explicit-any、no-unsafe-assignment 等规则，用 // @ts-expect-error 而不是 @ts-ignore 并强制写原因。开启 exactOptionalPropertyTypes 能区分可选属性的 undefined，但迁移成本高，要评估。

## 类型与运行时边界

类型只在编译期存在，运行时数据必须校验。外部输入（接口响应、URL 参数、localStorage）用 zod、valibot 或 io-ts 做 schema 校验，把校验结果作为类型来源，避免手写接口类型与真实数据漂移。API 类型可用 OpenAPI 生成，减少前后端字段不一致。类型定义要避免 god type 和过度泛型，可读性优先于炫技。