# codex-starter 重构上下文

本目录是当前这轮 `codex-starter` 重构的单一跟踪入口。

后续继续这轮工作时，先读：

1. `discussion/codex-starter-refactor/CONTEXT.md`
2. `discussion/codex-starter-refactor/PLAN.md`

不要再依赖零散聊天记录回忆上下文。

## 这轮重构要解决什么

当前核心问题不是单个文件过长，而是：

- 规则反复解释
- 中层角色定义重叠
- `Aide` 误入执行链
- 旧 `plan` 角色语义漂移
- 执行输入不唯一
- authority 已变化，但 runtime 约束还没完全跟上

## 已经确定的方向

### 1. 重构，不是从零重写

- 可以推翻中层历史债务
- 不要求兼容旧逻辑
- 但不是整套系统从零另起炉灶

### 2. 外层和内层分开

- `Aide` 只负责外层协调、治理、收口
- `Aide` 不直接管理 `coder` / `tester` / `qc` / `submit`
- 在流程线上，`Aide` 只和 `technical_manager` 对接

### 3. 中层收敛

当前中层目标语义：

- `产品经理`
- `架构师`
- `技术经理`

其中：

- `product_manager` 对应产品经理语义
- `architect` 对应架构师语义
- `technical_manager` 对应技术经理语义
- 旧 `plan` 不再作为独立角色存在
- `technical_manager` 不是单独一条任务线，而是职责范围与权能中心
- `product_manager` 直接对接 `Aide`
- `architect` 依赖 `product_manager` 产出的 `PRD`
- `architect` 的结果直接给 `technical_manager`
- 一旦进入 `product_manager` 路径，就自动启用 `architect`

### 4. 产物边界

- `PRD` 负责 WHAT / WHY / MVP
- 架构方案负责系统级 HOW
- `任务实施说明` 负责执行层单一输入
- 验证交接只负责 `tester -> technical_manager`
- 进度记录只负责 `technical_manager` 做了什么

其中：

- `任务实施说明` 的英文名定为 `Implementation Brief`
- 新的 `Implementation Brief` 取代旧 `plan` 文档，但不保留旧 `plan` 兼容层
- 旧 `plan` 里真正服务执行的内容保留进 `Implementation Brief`
- 旧 `plan` 里服务流程控制和历史兼容的内容直接删掉
- `plan-summary` 不改名保留，直接删除

### 5. 执行链原则

- 无编码任务：`Aide -> technical_manager -> Aide`
- 有编码任务：`Aide -> technical_manager -> coder -> tester`
- `QC` 在 `tester` 之后，由 `technical_manager` 控制是否进入
- `submit` 在验证链满足后进入

### 6. 执行输入与阻断原则

`任务实施说明` 是执行层唯一输入。

意思是：

- `coder`
- `tester`

都应该围绕同一份执行说明工作，而不是各自混读聊天记录、PRD、架构设计和零散 handoff。

并且：

- `technical_manager` 拿到上游产物后，必须先产出 `Implementation Brief`，再进入 `coder` / `tester`
- `coder` 完成后必须接 `tester`
- `tester` 之后是否进入 `qc`，由 `technical_manager` 决定
- `coder` / `tester` / `qc` 都只回复给 `technical_manager`
- 没有 `Implementation Brief` 时，`coder` / `tester` 不执行，直接 `blocked` 回给 `technical_manager`
- 这类 `blocked` 后，由 `technical_manager` 决定补说明、改线，或回 `Aide` 补用户信息
- 非编码任务时，`technical_manager` 不产出 `Implementation Brief`
- 但 `technical_manager` 只要做了事，就要留记录；产出 `Implementation Brief` 这件事本身也要记
- 这份记录先作为给 `Aide` 看的资料存在；`Aide` 如何消费这份资料后置讨论

## 本轮不主动做的事

- 不重写 `.codex/state/*.json` schema
- 不整体重做 `.codex/scripts/*`
- 不重写 `coder` / `tester` / `qc` / `submit` 的底层 structured result 形状
- 不做旧 skill 目录名和历史路径兼容
- 不在当前阶段展开 `Aide` 的能力范围细节

## 当前进展

第一阶段已经完成了 authority / 中层语义收敛：

- `AGENTS.md`
- `.codex/routing-policy.md`
- `aide/technical_manager/product_manager/architect` 的 skill 文本
- 相关模板
- 对应 smoke 测试

这些改动已经把中层定义向新模型收过去了。

当前新增进展：

- `technical_manager` 的权能关系已经讨论清楚
- `product_manager -> architect -> technical_manager` 的上游关系已经讨论清楚
- `Implementation Brief` 已确定为新执行主文档
- 当前计划已经拆成“面向用户的进度清单 + 施工清单 + 串行子线程编排”

## 当前 blocker

当前明确 blocker 不再只是“无 brief 的 runtime 阻断”，而是：

- `Implementation Brief` 主模板还没有真正补出来
- `plan-summary` 仍待删除
- authority / skills / templates / runtime 还没有把新权能关系完全收齐
- 工作区里已经有一组围绕“无 brief 时 blocked 回 technical_manager”的实现改动，但还需要主线程复核是否并入主线

因此：

- 这轮工作不能算完整收口
- 下一阶段要按串行子线程方式继续做实现，不要一边讨论一边发散施工范围

## 当前工作区状态说明

当前工作区里已经有一组未提交的代码改动，主要围绕：

- 缺少 `Implementation Brief` 时的 blocked 处理
- `technical_manager` / `coder` / `tester` / `qc` 之间的交接与提醒语义收口

继续开发时要注意：

- 不要把这组本地改动和 `discussion/*` 的记录提交混在一起
- 先由主线程复核当前这组代码改动，再决定是否并入主线
- 子线程按串行方式推进；上一个子线程完成并复核后，再开下一个
- 避免重新发散去重谈整套模型或路由策略

## 当前最重要的一句约束

后续所有改动都应服务于这一条：

**把已经定下来的角色关系、产物边界、执行输入规则，补齐到真正一致的 authority、模板、交接和 runtime 行为。**
