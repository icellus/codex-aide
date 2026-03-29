# Implementation Brief（任务实施说明）: [任务名称]

**Date**: [YYYY-MM-DD]  
**Owner**: `technical_manager`  
**Suggested Path**: `plans/[slug].md`

**Input Sources**:
- [用户目标 / Aide 交接摘要]
- [`PRD.md` 或具体 PRD 路径，若无填 `N/A`]
- [`ARCHITECTURE.md` 或具体架构文档路径，若无填 `N/A`]
- [关键仓库证据：代码/配置/测试/日志]

**Boundary Notes**:
- 只记录执行必需信息，不写流程结果类型
- 不写路由判断、角色启用判断、兼容语义
- 不写默认 summary、过长背景、讨论型 open questions

---

## 1. Goal

- [本次交付必须达成的结果]
- [可验证的业务或技术效果]

## 2. In Scope

- [必须实施的改动点]
- [边界条件]

## 3. Out of Scope

- [明确不做的事项]
- [延后处理项]

## 4. Acceptance & Validation Targets

- [完成判定标准]
- [关键验证目标：功能、接口、稳定性、回归等]

## 5. Target Files / Modules

- `[path/to/file-or-module]`: [预期改动]
- `[path/to/file-or-module]`: [预期改动]

## 6. Implementation Steps

1. [步骤 1：改动动作与约束]
2. [步骤 2：改动动作与约束]
3. [步骤 3：收口与一致性处理]

## 7. Validation Plan

- Command / Check: `[command-or-check]`
- Expected Result: [PASS 条件]
- Coverage Rationale: [为何该验证覆盖本次变更目标]

## 8. Risks & Dependencies

- Risk: [风险描述] | Mitigation: [缓解策略]
- Dependency: [外部系统/前置条件] | Fallback: [失败时处理方式]

## 9. Handoff Notes

- For `coder`: [实现阶段必须遵守的约束]
- For `tester`: [必须覆盖的验证重点]
- For `technical_manager`: [交付收口时需确认的事项]
