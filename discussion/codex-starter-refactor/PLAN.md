# codex-starter 重构计划清单

本文件分两层：

- 面向你的进度清单：让你能快速看懂现在做到哪一步
- 施工清单：给我自己推进实现用，但尽量不写得太碎、太偏代码

两层都按“已完成 / 未完成”维护。

## 这轮要解决什么

这轮重构要解决的不是单个文件长不长，而是整条协作链路不够清楚：

- 外层谁负责协调
- 中层谁负责接执行任务
- 编码和测试到底围绕什么输入工作
- 必须环节和可选环节分别是什么

最后目标是：

- 角色分工讲得清楚
- 执行链路真的按这个分工运行
- 不再出现规则一套、实际行为又是另一套

## 面向你的进度清单

### 已完成

- [x] 中层角色已经收敛到 `product_manager`、`architect`、`technical_manager`
- [x] `Aide` 已经从“直接带执行角色”的定义里退出来
- [x] `technical_manager` 的角色定义已经明确下来
- [x] `Aide` 在流程线上只和 `technical_manager` 对接
- [x] `product_manager` 直接对接 `Aide`
- [x] `architect` 依赖 `product_manager` 产出的 `PRD`
- [x] `architect` 的结果直接给 `technical_manager`
- [x] 一旦进入 `product_manager` 路径，就自动启用 `architect`
- [x] 什么时候启用 `product_manager`，先归到路由策略，当前不展开
- [x] `任务实施说明` 已经被确定为执行层共享输入
- [x] `任务实施说明` 的英文名定为 `Implementation Brief`
- [x] 新的 `任务实施说明` 取代旧 `plan` 文档，但不保留旧 `plan` 兼容层
- [x] 现有产物已经梳理清楚：`PRD`、架构方案、`任务实施说明` 摘要、验证交接、进度记录
- [x] 当前明确缺口是：仓库里还没有真正成型的 `任务实施说明` 主模板
- [x] `plan-summary` 这个名字必须删除，且当前判断这份摘要文件没有继续保留的必要
- [x] 旧 `plan` 里真正服务执行的内容继续保留：目标、范围、目标文件/模块、实施步骤、验证计划、风险/依赖
- [x] 旧 `plan` 里服务流程控制和历史兼容的内容直接删掉：结果类型、路由判断、角色启用判断、默认 summary、过长背景和讨论型 open questions
- [x] 新的 `任务实施说明` 补入当前链路真正需要的内容：输入来源、`out of scope`、验收/验证目标、交接说明
- [x] `任务实施说明` 的“输入来源”是必有栏目，但 `PRD` / 架构方案不是必备来源；有则写，没有则不强行补
- [x] `technical_manager` 拿到上游产物后，必须先产出 `任务实施说明`，再进入 `coder` / `tester`
- [x] 非编码任务时，`technical_manager` 不产出 `任务实施说明`
- [x] `technical_manager` 只要做了事，就要留记录
- [x] 编码任务里，产出 `任务实施说明` 这件事本身也要记
- [x] 这份记录先作为给 `Aide` 看的资料存在，但 `Aide` 怎么消费这份资料后置
- [x] `coder` / `tester` 已经开始围绕同一份执行说明工作
- [x] 编码任务中，`coder` 完成后必须接 `tester`
- [x] 编码任务中，`tester` 之后是否进入 `qc`，由 `technical_manager` 决定
- [x] `coder` / `tester` / `qc` 统一回复给 `technical_manager`
- [x] 没有 `任务实施说明` 时，`coder` / `tester` 不执行，直接 `blocked` 回给 `technical_manager`
- [x] 这类 `blocked` 之后，由 `technical_manager` 决定补说明、改线，或回 `Aide` 补用户信息
- [x] 旧命名、旧字段、旧语义默认不做兼容保留
- [x] 缺少执行说明路径的正常完成态，已经开始被拦住
- [x] 一部分提醒和交接文案，已经开始向新链路收口

### 未完成

- [ ] authority、交接规则、运行期行为是否都已经体现这套权能关系，还没完全收齐
- [ ] 把新的 `任务实施说明` 主模板补齐，并与现有产物边界对齐
- [ ] 删除 `plan-summary` 及其残留引用
- [ ] 按“不兼容旧语义”的原则，把残留旧命名、旧字段、旧语义清干净
- [ ] 按最终定下来的结论，把剩余实现全部收口
- [ ] 做整轮统一 review
- [ ] 做整轮统一验证

## 施工清单

### 下一个施工目标

- [ ] 把“没有 `任务实施说明` 时，`coder` / `tester` 直接 `blocked` 回 `technical_manager`”这条规则收齐到系统里
- [ ] 确保 `coder` 因缺少 `任务实施说明` 被阻断后，不继续进入 `tester` / `qc` / `submit`
- [ ] 确保 `tester` 因缺少 `任务实施说明` 被阻断后，不继续进入后续收口动作
- [ ] 确保这类 `blocked` 的后续动作都回到 `technical_manager`，而不是直接落到下游角色
- [ ] 确保需要补用户信息时，仍然是 `technical_manager -> Aide -> 用户`
- [ ] 清掉和这条规则冲突的旧文案、旧提醒、旧交接语义

### 已完成

- [x] authority、routing、中层 skill 文本已经完成第一轮收敛
- [x] 中层角色命名已经切到 `product_manager / architect / technical_manager`
- [x] `Aide` 不直接带执行角色的约束已经落到 authority
- [x] `Aide -> technical_manager -> 下游角色` 的主关系已经写清
- [x] `Aide -> product_manager -> architect -> technical_manager` 这条上游关系已经定下
- [x] `architect` 依赖 `PRD`，且结果直接给 `technical_manager`
- [x] 已确认当前产物边界：`PRD` 负责 WHAT/WHY，架构方案负责系统级 HOW，`任务实施说明` 负责执行，验证交接只负责 tester 结果，进度记录只负责过程记录
- [x] `coder / tester / qc -> technical_manager` 的回报关系已经明确
- [x] 新 `任务实施说明` 的内容边界已经定下：保留执行必需内容，删掉旧 `plan` 的流程控制内容，再补上输入来源、验收和交接说明
- [x] `plan-summary` 不改名保留，直接删除
- [x] 输入来源栏位必须保留，但具体来源按实际任务填写，不强制要求 `PRD` 或架构方案同时存在
- [x] `technical_manager` 先产出 `任务实施说明`，再进入 `coder` / `tester`
- [x] 非编码任务不产出 `任务实施说明`，但 `technical_manager` 仍需留记录
- [x] `technical_manager` 产出 `任务实施说明` 这件事本身也属于必须记录的内容
- [x] `coder` / `tester` 的执行说明已经切到围绕 `technical_manager` 提供的输入
- [x] “无 `任务实施说明` 时 `coder` / `tester` 直接 `blocked` 回 `technical_manager`”这条处理规则已经定下
- [x] 旧命名、旧字段、旧语义不做兼容保留，这条策略已经定下
- [x] 运行期 contract 已经开始阻断缺少执行说明路径的正常完成态
- [x] 部分 reminder / handoff 文案已经开始从旧执行入口语义收口

### 未完成

- [ ] 检查 authority、交接规则、运行期行为，是否都体现 `technical_manager` 的权能范围
- [ ] 检查 authority、skills、templates 是否都体现 `product_manager -> architect -> technical_manager` 的关系
- [ ] 检查 `Aide` 是否还残留直接碰执行角色的语义
- [ ] 检查 `coder` / `tester` / `qc` 是否还残留直接对外对接的语义
- [ ] 把编码任务里 `coder -> tester -> 可选 qc` 的链路继续按 `technical_manager` 决策收齐
- [ ] 按“不兼容旧语义”策略清理旧命名、旧字段、旧文案残留
- [ ] 检查“无 `任务实施说明` -> `blocked` 回 `technical_manager`”这条规则是否已经落实一致
- [ ] 按定下来的结论，继续补剩余运行期行为
- [ ] 清理系统里还留着的旧语义残留
- [ ] 做统一 review
- [ ] 做统一验证
- [ ] 最终收口

## 子线程编排

按串行方式推进，每次只开一个新的子线程；上一个子线程完成并由主线程复核后，再开下一个。

### 子线程 1

- [x] 收齐“无 `任务实施说明` 时 `coder` / `tester` blocked 回 `technical_manager`”这条规则
- [ ] 主线程复核并决定是否并入主线

### 子线程 2

- [ ] 收齐 `product_manager -> architect -> technical_manager` 关系到 authority、skills、templates
- [ ] 把新的 `任务实施说明` 内容边界落实到相关 skills、templates、说明文档
- [ ] 补齐真正的 `Implementation Brief` 主模板，并与验证交接、进度记录分清边界
- [ ] 删除 `plan-summary` 及其相关字段和残留引用
- [ ] 清掉和这条关系冲突的旧文案、旧说明

### 子线程 3

- [ ] 收齐 `technical_manager -> coder -> tester -> 可选 qc` 的运行期交接、提醒、收口语义
- [ ] 清掉和这条执行链冲突的旧提醒、旧 pending action、旧 handoff 语义

### 子线程 4

- [ ] 按“不兼容旧语义”策略，清理旧命名、旧字段、旧文案残留
- [ ] 复查是否还有会误导流程关系的旧表述

### 子线程 5

- [ ] 统一 review
- [ ] 统一验证
- [ ] 最终收口

## 后置独立议题

- [ ] `Aide` 的能力范围放到后面单独讨论
- [ ] 这部分不并入当前 `technical_manager` 权能关系收口
- [ ] 在已经确认 `Aide` 职责后，再讨论它在治理、提醒、复盘里的保留范围

## 当前最优先

- 先复核子线程 1 的结果，再决定是否开子线程 2
- `Aide` 的能力范围不是当前优先项，先不展开
- 不继续盲目展开更多细碎施工项
- 规则定清后，再继续往下补实现

## 记录规则

- 你先看“面向你的进度清单”
- 我推进时看“施工清单”
- 如果结论变了，先改这个文件
- 如果出现新 blocker，先写成“还有哪个问题没定清”，不要直接写成代码任务
- 整轮完成后，再统一 review 和验证
