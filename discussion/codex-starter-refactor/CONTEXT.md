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
- `plan` 语义漂移
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

### 3. 中层收敛

当前中层目标语义：

- `产品经理`
- `架构师`
- `技术经理`

其中：

- `prd` 对应产品经理语义
- `architect` 对应架构师语义
- `conduct` 对应技术经理语义
- `plan` 不再被理解成泛计划；它的产物语义是 `任务实施说明`

### 4. 执行链原则

- 无编码任务：`Aide -> 技术经理 -> Aide`
- 有编码任务：`Aide -> 技术经理 -> coder -> tester`
- `QC` 在 `tester` 之后，由技术经理控制是否进入
- `submit` 在验证链满足后进入

### 5. 执行输入原则

`任务实施说明` 是执行层唯一输入。

意思是：

- `coder`
- `tester`

都应该围绕同一份执行说明工作，而不是各自混读聊天记录、PRD、架构设计和零散 handoff。

## 本轮不主动做的事

- 不重写 `.codex/state/*.json` schema
- 不整体重做 `.codex/scripts/*`
- 不重写 `coder` / `tester` / `qc` / `submit` 的底层 structured result 形状
- 不做旧 skill 目录名和历史路径兼容

## 当前进展

第一阶段已经完成了 authority / 中层语义收敛：

- `AGENTS.md`
- `.codex/routing-policy.md`
- `aide/conduct/plan/prd/architect` 的 skill 文本
- 相关模板
- 对应 smoke 测试

这些改动已经把中层定义向新模型收过去了。

## 当前 blocker

reviewer 已确认一个高优先级 blocker：

- authority 已声明：`任务实施说明` 是 `coder/tester` 唯一执行输入
- 但 runtime / 协议层还没强制
- 现在仍存在无 `plan_path` / brief 的 `coder -> tester` 链路

因此：

- 这轮工作不能算完整收口
- 下一阶段必须把“唯一执行输入”落到执行协议和 runtime 约束

## 当前工作区状态说明

当前工作区里已经有未提交的第一阶段改动。

继续开发时要注意：

- 不要把第一阶段 authority 收敛当成已完成最终状态
- 先围绕 blocker 做第二阶段
- 避免重新发散去重谈整套模型

## 当前最重要的一句约束

后续所有改动都应服务于这一条：

**把 authority 已经确定的新中层语义，补齐到真正可执行的协议和 runtime 约束。**
