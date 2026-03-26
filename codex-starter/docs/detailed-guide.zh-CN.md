# 详细说明

这份文档面向需要真正改造或扩展 `codex-starter` 的人。

它描述的是当前这版 starter 的最新设计，而不是历史演化过程。

## 1. 当前模型

`codex-starter` 现在有两条交付线：

- coding
- product

两条线共享 `/Aide` 做 intake、路由和治理，但执行角色不同、沉淀位置不同、后续动作也不同。

除此之外，`/Aide` 还直接承担一类不进入执行线的讨论型工作：

- 问答
- 分析
- 方案比较
- 路线建议

这类回合的交付物是结论，不是持久产物。

### coding

适合：

- 代码改动
- 行为改动
- 验证
- release / governed delivery

核心角色：

- `tester`
- `coder`
- `/qc`
- `/submit`

### product

适合：

- 文档
- API 描述
- 结构化非代码产物
- 打包交付物
- 其他非代码输出

核心角色：

- `product_assistant`

## 2. 目录边界

### `AGENTS.md`

这里只放：

- 全局姿态
- slash command 映射
- 少量 guardrails

不要把它重新写成一份总规范大全。

### `.agents/skills/`

这里放的是 skill 契约。

当前最关键的是：

- `aide`
- `conduct`
- `qc`
- `submit`

其中：

- `/Aide` 负责 intake、路由、治理
- `conduct` 负责 delivery routing 和 `environment setup`

### `.codex/`

这里放运行时层内容：

- 角色定义
- 路由策略
- 热状态
- 运行时脚本
- coding 线相关辅助产物

### `.product/`

这里放 product 线自己的沉淀：

- `templates/`
- `registry.json`
- `memory.json`
- `evolution.json`

这个目录不是运行时热状态，也不是用户最终文档目录。  
它是 product 线的内部沉淀层。

## 3. `/Aide` 的职责边界

`/Aide` 的职责有五类：

1. intake
2. routing
3. direct discussion handling
4. governance
5. result review

它不应该替执行角色做业务。

### 在 discussion 回合里

`/Aide` 的重点是：

- 直接回答问题，而不是为了分工强行下派
- 只读取当前回答需要的最小上下文
- 默认不写热状态或历史登记
- 只有当用户目标变成具体交付物或执行流程时才升级路由

### 在 coding 线里

`/Aide` 的重点是：

- 是否需要 `tester`
- 是否需要 `coder`
- 是否需要 `/qc`
- 是否需要 `/submit`
- 有没有治理问题

### 在 product 线里

`/Aide` 的重点是：

- 这次是否真的该走 `product_assistant`
- 完成边界是否已经足够
- `.product/*` 写回是否有真实对话依据
- 问题到底是：
  - 用户信息不够
  - 理解偏差
  - 还是边界不对，该切 coding

当前规则是：

- `/Aide` 审 `product_assistant` 结果时必须看真实聊天记录
- `.product/memory.json` 是弱记忆
- 当前对话优先于旧记忆
- 完成边界不稳时，应做轻量反馈确认
- 讨论型回合默认不因为技术复杂就升级进执行流

## 4. `product_assistant` 的职责边界

`product_assistant` 是独立的非代码交付角色。

它负责：

- 编写和维护文档
- API 描述
- 结构化非代码内容
- 打包交付物
- `.product/*` 的直接更新

它不负责：

- coding 线的验证 owner 角色
- `/qc`
- `/submit`
- implementation ownership

但它可以：

- 读取代码
- 读取配置
- 读取接口定义
- 读取结构化资料

目的是把信息整理成适合当前任务和受众的输出，而不是把实现细节直接甩给用户。

### 当前输出约束

- 避免 AI 腔
- 避免空泛 framing
- 避免无意义的技术噪音
- 但不要牺牲技术文档里真正需要的精确性

## 5. `.product/*` 的当前含义

### `.product/templates/`

可复用模板目录。

starter 默认不内置具体模板。  
模板应在真实使用中由 `product_assistant` 逐步沉淀。

### `.product/registry.json`

模板注册表。

作用：

- 记录有哪些模板
- 记录适用的产物类型和触发词
- 记录最近使用和更新信息

### `.product/memory.json`

轻量偏好记忆。

作用：

- 记录用户偏好
- 记录仓库层面的文风或产物偏好

当前规则：

- 当前对话优先
- 只记明确或重复出现的偏好
- 不是配置文件，不应写成刚性规则

### `.product/evolution.json`

进化候选队列。

作用：

- 记录重复出现的错配
- 为后续角色约束优化提供证据

当前规则：

- `product_assistant` 可以提出候选
- `/Aide` 审核时必须看真实聊天记录
- 重复错配才值得升级成角色变更候选

## 6. 结构化结果

当前 `product_assistant` 的结构化结果需要覆盖：

- 改了哪些产物
- 用了哪些来源
- 更新了哪些模板条目
- 更新了哪些记忆条目
- 产生了哪些进化候选
- 还有哪些未解决缺口
- 是否 `complete` 或 `blocked`

这个设计直接对齐 `.product/*` 的条目结构。

## 7. `/Aide` 的最小自动审核接线

目前已经接上的自动化是：

- `product_assistant` 完成且带有模板/记忆/进化写回时，自动排一个 `/Aide review`
- `product_assistant` 阻塞时，自动排一个 investigation review

这部分只做最小自动接线，不复制 coding 线的整套 QC / submit 流程。

## 8. 当前文档设计结论

这版 starter 文档只表达当前状态：

- 当前有两条交付线
- `.product/` 是正式工作区
- `product_assistant` 是正式执行角色
- `/Aide` 对 product 结果做聊天记录优先的复审
- product 记忆是轻量、可修正、弱约束

如果你继续扩展这套 starter，优先级建议是：

1. 先改角色和路由契约
2. 再改 `.product/*` 的写回策略
3. 最后再补更多自动化
