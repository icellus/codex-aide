# Discussion History

Updated: 2026-03-30 00:33 Asia/Shanghai
Topic: `codex-starter` 中层角色/执行入口重构

## 本轮完成

- 围绕 `codex-starter` 中层混乱问题，明确了当前重构目标不是整套系统重写，而是：
  保留上层 `Aide` 与下层执行骨架，重构中层角色与中层文档语义。
- 收敛了当前中层语义方向：
  - `product_manager` 对应产品经理语义
  - `architect` 对应架构师语义
  - `technical_manager` 对应技术经理语义
  - 旧 `plan` 角色取消，`任务实施说明` 收敛为技术经理产物
- 明确了执行链边界：
  - `Aide` 不直接管理 `coder` / `tester` / `qc` / `submit`
  - 执行类任务先进入 `technical_manager`
  - 有编码任务固定走 `technical_manager -> coder -> tester`
- 完成了第一阶段 authority / skill / template 收敛，并同步更新了一批 smoke 测试。
- reviewer 指出高优先级 blocker：
  authority 已声明“`任务实施说明` 是 `coder/tester` 唯一执行输入”，但 runtime / 协议层还没有完全强制它。
- 随后推进了第二阶段的第一个子块：
  收紧 `coder.toml` / `tester.toml` 协议文本，不再接受 `plan_path: null` 的完成态，并更新最小关联 smoke 测试。
- 把本轮重构的跟踪入口单独落到：
  - `discussion/codex-starter-refactor/CONTEXT.md`
  - `discussion/codex-starter-refactor/PLAN.md`
- 当前所有已完成改动已提交并推送到独立分支：
  - branch: `refactor/codex-starter-middle-layer`
  - commit: `d9c63ec`

## 本轮结论

- 第一阶段“中层 authority 收敛”已经完成。
- 第二阶段目前只完成了“执行协议收口”的一部分。
- 当前仍不能发 PR，因为 runtime 行为还没有完全跟上新的 authority 语义。

## 当前 blocker

- `任务实施说明` 虽然已在 authority 和协议文本中被收紧，
  但 runtime 仍可能允许无 brief 的 `coder -> tester` 链路继续。
- runtime reminder / pending action 语义里也还残留旧执行入口表达。

## 下次应直接继续的内容

只继续一个主题：

1. 把 `任务实施说明` 从 authority / 协议层，落到 runtime 约束层

具体包括：

- runtime 阻断无 brief 的 `coder -> tester` 继续链路
- pending action / reminder / handoff 语义收口到新中层链路
- 对应 smoke 测试补齐

## 当前建议读取顺序

1. `discussion/codex-starter-refactor/CONTEXT.md`
2. `discussion/codex-starter-refactor/PLAN.md`
3. 再看当前分支 diff 和相关 runtime 文件

不要再先从零散聊天记录恢复上下文。
