# codex-starter 重构计划清单

本文件只记录当前这轮重构的任务边界、完成状态和下一步。

## 总体范围

### In Scope

- 中层角色与执行入口语义收敛
- `Aide` 从执行链退出
- `任务实施说明` 产物语义收敛为技术经理产出
- `任务实施说明` 落到执行协议与 runtime 约束
- 对应测试更新

### Out Of Scope

- 大改 `.codex/state/*.json` schema
- 大改 `.codex/scripts/*`
- 重写下层执行骨架
- 历史路径兼容层
- 额外扩展新的角色体系讨论

## 阶段清单

### 阶段 1：authority 与中层语义收敛

- [x] `AGENTS.md` 收敛到新中层语义
- [x] `.codex/routing-policy.md` 收敛到新中层语义
- [x] `Aide` 不再直连执行角色
- [x] `technical_manager` 收敛到技术经理语义
- [x] `product_manager` 收敛到产品经理语义
- [x] `architect` 收敛到架构师语义
- [x] 旧 `plan` 角色已收进 `technical_manager`
- [x] 模板同步收敛
- [x] 第一阶段 smoke 测试同步
- [x] reviewer 已完成第一阶段审查

阶段 1 结论：

- authority 已收敛
- 但仍有一个高优先级 blocker，不能视为最终完成

### 阶段 2：执行协议收口

- [ ] `coder` 协议不再接受无 brief 的正常完成态
- [ ] `tester` 协议不再接受无 brief 的正常完成态
- [ ] 与 `plan_path` / brief 对应的最小测试更新
- [ ] reviewer 复核“协议已与 authority 一致”

### 阶段 3：runtime 约束收口

- [ ] runtime 阻断无 brief 的 `coder -> tester` 继续链路
- [ ] pending action 语义和新中层链路一致
- [ ] reminder / handoff 文案不再保留旧执行入口语义
- [ ] 对应 smoke 测试更新

### 阶段 4：收口

- [ ] 全量 review
- [ ] 相关测试通过
- [ ] 确认没有误碰下层协议和 state schema
- [ ] 提交

## 当前正在做

当前只推进：

- 阶段 2：执行协议收口

原则：

- 先收协议
- 不顺手把整个 runtime 一起改大

## 检查清单

提交前必须逐项确认：

- [ ] `Aide` 是否仍残留直接管理执行角色的语义
- [ ] `technical_manager` 是否是执行链唯一入口 owner
- [ ] `任务实施说明` 是否在 authority 和协议层都成立
- [ ] `coder` / `tester` 是否仍可在无 brief 情况下继续链路
- [ ] `QC` 是否仍在 `tester` 之后
- [ ] `.codex/state/*.json` schema 是否未被误改
- [ ] `coder` / `tester` / `qc` / `submit` 的底层 structured result 形状是否未被无必要重写
- [ ] 测试是否覆盖新约束，而不是只覆盖旧文案

## 记录规则

- 继续这轮任务时，先更新本文件状态，再继续改代码
- 出现新的 blocker，先写入本文件，再决定是否继续扩改
- 如果阶段目标变化，优先改本文件，不要只在聊天里说明
