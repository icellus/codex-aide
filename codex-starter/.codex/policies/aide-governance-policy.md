---
{
  "version": 1,
  "default_disposition": {
    "G1": "auto-fix",
    "G2": "ask-user",
    "G3": "ask-user"
  },
  "auto_fix_levels": ["G1"],
  "persist_fields": ["issue", "level", "authority_target", "disposition", "note"]
}
---

# Aide Governance Policy

本文件是 `Aide` 治理规则的单点 authority。

## Governance Objects

- 角色合同
- 路由规则
- 关键 runtime 行为
- 默认状态与默认摘要
- 共享提示与共享约束

## Governance Triggers

- 同一类失败重复出现
- 多个文件对同一概念定义不一致
- runtime 行为与合同不一致
- 默认值、提示语或状态字段持续写回旧模型
- 角色边界反复漂移或越界

## Governance Levels

### G1

- 低风险治理项
- 只修正文案、摘要、去重、默认描述、目录指向或低风险文本写回
- 不改变系统行为，不改变角色边界，不改变路由决策

### G2

- 中风险治理项
- 会影响系统合同、自我理解、角色边界或 authority 归属
- 不直接改变 runtime 自动行为

### G3

- 高风险治理项
- 会影响 runtime 自动行为、路由推进、状态流转或治理边界
- 一旦改错会直接改变系统运行结果

## Governance Output

每次治理输出固定包含：

- `issue`
- `level`
- `impact`
- `authority_target`
- `recommended_action`
- `disposition`

## State Persistence

治理结果在状态层最少保留以下字段：

- `issue`
- `level`
- `authority_target`
- `disposition`
- `note`

## Automatic Disposition

- `G1 -> auto-fix`
- `G2 -> ask-user`
- `G3 -> ask-user`

自动写回只允许 `G1`。
