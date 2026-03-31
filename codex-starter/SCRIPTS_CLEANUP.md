# `codex-starter/.codex/scripts` 重做审计与减负记录

日期：2026-03-31

本文件替代上一版 `SCRIPTS_CLEANUP.md`。上一版偏向“引用与可执行性清理”，不符合本次目标，结论作废。

## 1. 审计口径

本次审计只问一个问题：

`这段脚本代码在当前 codex-starter 的唯一契约下，是否是真正有效、可靠、值得继续保留的实现？`

本次不采用以下错误保留理由：

- 文件之间互相引用
- CLI 还能跑
- 未来也许会接上
- 兼容旧状态、旧字段、旧入口

本次采用的当前契约依据：

- `codex-starter/AGENTS.md`
- `.codex/skills/aide/SKILL.md`
- `.codex/policies/routing-policy.md`
- `.codex/hooks.json`
- `.codex/policies/validation-profile.json`
- 当前仍在使用的脚本真实输入日志

审计后的处理原则：

- 当前真实有效：保留
- 历史兼容：删除
- 没有接上线的子系统：删除，并在本文归档缺口
- 删除后缺失但产品仍可能需要的能力：归档，不在本次伪补

## 2. 审计结论总览

### 2.1 当前保留的脚本

保留 5 个文件：

1. `.codex/scripts/context/task-overview.mjs`
2. `.codex/scripts/guards/validate-validation-profile.mjs`
3. `.codex/scripts/shared/io.mjs`
4. `.codex/scripts/shared/logging.mjs`
5. `.codex/scripts/shared/project-context.mjs`

### 2.2 本次删除的脚本

删除 20 个文件：

1. `.codex/scripts/context/startup.mjs`
2. `.codex/scripts/context/session.mjs`
3. `.codex/scripts/governance/audit.mjs`
4. `.codex/scripts/governance/writeback.mjs`
5. `.codex/scripts/runtime/index.mjs`
6. `.codex/scripts/runtime/profile-state.mjs`
7. `.codex/scripts/runtime/progress-sync.mjs`
8. `.codex/scripts/runtime/progress.mjs`
9. `.codex/scripts/runtime/queue.mjs`
10. `.codex/scripts/runtime/registry.mjs`
11. `.codex/scripts/runtime/state-delivery.mjs`
12. `.codex/scripts/runtime/state-normalizers.mjs`
13. `.codex/scripts/runtime/state-reviews.mjs`
14. `.codex/scripts/runtime/state-workflow.mjs`
15. `.codex/scripts/runtime/state.mjs`
16. `.codex/scripts/runtime/store-shapes.mjs`
17. `.codex/scripts/runtime/store.mjs`
18. `.codex/scripts/runtime/structured.mjs`
19. `.codex/scripts/guards/validate-git.mjs`
20. `.codex/scripts/logs/analyze.mjs`

### 2.3 删除后的产品缺口归档

本次明确归档但不补的能力：

1. `git` 门禁缺口
2. 事件驱动执行链状态自动化缺口
3. 自动治理写回缺口
4. 任务历史注册表缺口
5. repo context 缓存缺口

## 3. 当前保留脚本逐文件审计

### 3.1 `.codex/scripts/shared/io.mjs`

- 顶层函数：`invalidJsonInputError`、`readRawStdin`、`readJsonStdinEnvelope`、`readJsonStdin`
- 结论：保留
- 理由：
  - 是当前仍在运行的脚本公共输入层
  - 没有历史兼容分支，也没有产品假能力
  - 输入约束简单，风险可控

### 3.2 `.codex/scripts/shared/logging.mjs`

- 顶层函数：`ensureDir`、`sanitizeLogValue`、`serializeRuntimeError`、`normalizeRuntimeLogChunk`、`runtimeLogDay`、`runtimeLogDir`、`escapeRegExpLiteral`、`runtimeLogPartName`、`runtimeLogPathForPart`、`parseRuntimeLogPartIndex`、`listRuntimeLogParts`、`runtimeLogMaxBytes`、`runtimeLogPath`、`runtimeLogEntryKey`、`appendRuntimeLog`、`startRuntimeInvocationLogging`
- 结论：保留并收窄
- 本次删除：
  - legacy runtime log 迁移逻辑
  - `logRuntimeFileWrite`
  - 活跃 logger 全局状态
- 理由：
  - 当前只需要 invocation 级日志
  - 已删除的执行状态子系统不再需要 file write trace
  - 旧日志迁移属于历史兼容，本次明确抛弃

### 3.3 `.codex/scripts/shared/project-context.mjs`

- 顶层函数：`normalizeProjectDirCandidate`、`findProjectDir`、`getProjectContext`
- 结论：保留并收窄
- 本次删除：
  - `projectDirCandidates`
  - 大量旧输入别名：`project_dir`、`repoRoot`、`repo_root`、`repoPath`、`repo_path`、`workdir`、`workspace`、`tool_input.*`
- 理由：
  - 当前真实输入来源只有 `env.CODEX_PROJECT_DIR`、`input.projectDir`、`input.cwd`、`process.cwd`
  - 其余别名没有当前契约证据，只是历史兼容负担

### 3.4 `.codex/scripts/context/task-overview.mjs`

- 顶层函数：`normalizeText`、`compactText`、`basenameLabel`、`readJsonFile`、`readProfileField`、`loadCurrentTask`、`formatTaskLine`、`main`
- 结论：保留并重写
- 本次删除：
  - 对 `runtime/` 聚合层的依赖
  - 对 `task-registry` / `runtime-state` / `progress` 的自动同步依赖
  - “历史 unfinished/completed task” 的伪支持
- 当前职责：
  - 只读取当前 `task-context.json`
  - 若没有 `task-context.json`，回退到 `project-profile.md`
  - 提供当前任务概览
  - 当请求历史时，明确返回“shipped scripts 不维护历史注册表”
- 理由：
  - 这是当前 hooks 唯一真正需要的用户可见脚本
  - 当前产品没有真实维护 task history；继续假装支持 history 只会制造错误认知

### 3.5 `.codex/scripts/guards/validate-validation-profile.mjs`

- 顶层函数：`isPlainObject`、`profilePath`、`readProfile`、`validateProfile`、`main`
- 结论：保留
- 理由：
  - 仍被 `Aide` 运行规则明确依赖
  - 它校验的是当前真实产品契约，不是历史兼容逻辑

## 4. 删除脚本逐文件审计

### 4.1 `.codex/scripts/context/startup.mjs`

- 顶层函数：`normalizeStepInput`、`runStep`、`main`
- 结论：删除
- 理由：
  - 只是一个三段式 wrapper
  - 真正有价值的只有 `task-overview`
  - 另外两段 `writeback` 与 `session` 都依赖未落地的状态自动化
  - 保留它只会把空转脚本串在一起执行

### 4.2 `.codex/scripts/context/session.mjs`

- 顶层函数：`summarizePendingQCActions`、`summarizePendingTesterActions`、`summarizePendingSubmitActions`、`summarizeBlockedActions`、`summarizeGovernanceQueue`、`summarizeGovernanceReviews`、`summarizeRetrospectiveActions`、`main`
- 结论：删除
- 理由：
  - 完全依赖 `runtime-state.json` 的 `pendingActions` / `governanceQueue` / `sessionContext`
  - 当前 hooks 没有接入 `runtime/state.mjs`
  - 日志证据显示它实际长期输出为空
  - 属于“未接线上游存在时才有意义”的假能力

### 4.3 `.codex/scripts/governance/writeback.mjs`

- 顶层函数：`candidateTimestamp`、`reviewTimestamp`、`normalizeGovernanceLevel`、`governanceDisposition`、`authorityTargetForCandidate`、`createDefaultWritebackPolicy`、`loadWritebackPolicy`、`buildGovernanceReviewCandidate`、`buildGovernanceQueueCandidate`、`relatedSignalsForTask`、`upsertCandidate`、`resolveStaleCandidates`、`reviewedSettledTaskKey`、`hasSettledTaskReview`、`upsertSettledTaskReview`、`policyForCategory`、`insertGuidanceIntoAgentToml`、`applyGuidanceWriteback`、`enrichGovernanceCandidateFromPolicy`、`applyAutomaticWritebacks`、`sortAndTrimRegistry`、`main`
- 结论：删除
- 理由：
  - 输入依赖 `runtime-state.pendingActions` 与 `runtime-state.governanceQueue`
  - 上游事件脚本未接上线
  - 实际运行只会在 startup 时反复写空的 `task-registry.json` 和 `governance-registry.json`
  - 属于高复杂度、低现实价值、强假设脚本
  - 对应的 `.codex/policies/aide-writeback-policy.json` 一并删除

### 4.4 `.codex/scripts/governance/audit.mjs`

- 顶层函数：`relativePath`、`readText`、`listFiles`、`parseSkillMetadata`、`addFinding`、`hasSection`、`governanceDisposition`、`pushGovernanceRecord`、`levelForAuditFinding`、`levelForPendingReview`、`levelForGovernanceCandidate`、`collectAuditFindings`、`isUsefulDedupLine`、`normalizeDedupLine`、`dedupAuthoritySuggestion`、`collectDedupCandidates`、`collectPendingGovernanceReviews`、`renderPendingReviews`、`collectActiveGovernanceCandidates`、`renderGovernanceCandidates`、`renderAuditFindings`、`renderDedup`、`main`
- 结论：删除
- 理由：
  - 一半依赖已删除的 governance/runtime state
  - 另一半是泛化“文案去重”和“治理打分”，但没有和当前产品入口绑定
  - 实际输出长期是空 review + 噪音 dedup
  - 对当前 starter 不是可靠能力，而是高噪声实验性工具

### 4.5 `.codex/scripts/runtime/index.mjs`

- 顶层导出：整个 `runtime/*` 聚合导出
- 结论：删除
- 理由：
  - 其存在前提是 `runtime` 子系统仍然是 shipped 基础设施
  - 本次审计结论正相反：`runtime` 大部分是未落地或历史兼容堆积

### 4.6 `.codex/scripts/runtime/profile-state.mjs`

- 顶层函数：`normalizeProfileValue`、`normalizeDeliveryModeValue`、`normalizeEnabledModuleValue`、`normalizeListValue`、`readProfileField`、`parseProfileList`、`mapTaskContextToProfile`、`loadProjectProfileState`、`isQcEnabled`、`isSubmitEnabled`、`isTaskSettled`、`isLongRunningProfile`
- 结论：删除
- 理由：
  - 混入大量明确历史兼容：`direct`、`plan-driven`、`orchestrated`、旧 module 名映射
  - 依赖被删除的 workflow state 结构
  - 在本次最小有效脚本集里只需要当前任务概览，不需要整套 runtime profile 派生

### 4.7 `.codex/scripts/runtime/progress-sync.mjs`

- 顶层函数：`normalizeArtifactField`、`extractTitle`、`normalizeTaskStatus`、`hasUnsettledStatus`、`summarizeRetryPattern`、`resolveTaskIdFromProgressChunk`、`updateQcRetryPatternLine`、`updateCurrentWorkSection`、`buildGovernanceQueueBlock`、`updateGovernanceQueueSection`、`retrospectiveSlug`、`buildRetrospectiveBlock`、`parseRetrospectiveChunk`、`isPendingAutoRetrospective`、`nextRetrospectiveId`、`updateSessionRetrospectiveSection`、`syncProgressFromState`
- 结论：删除
- 理由：
  - 依赖被删除的 runtime state / governance queue / retrospective 机制
  - 还在围绕旧 `PROGRESS.md` 风格做写回
  - 与当前 `.codex/progress/active/<task-id>/current.md` 契约不一致

### 4.8 `.codex/scripts/runtime/progress.mjs`

- 顶层函数：`normalizeArtifactField`、`extractPlanPath`、`extractSummaryPath`、`stripHtmlComments`、`basenameLabel`、`findProgressFile`、`parseActivePlans`、`extractSectionBody`、`splitProgressBlocks`、`escapeRegExp`、`extractBulletField`、`extractTitle`、`parseCurrentWorkItems`、`parseParkedWorkItems`、`parseCompletedWorkItems`、`parseProgressTasks`、`normalizeComparablePath`、`resolveWorkflowPath`、`pathContains`、`currentGitBranch`、`resolveActivePlan`
- 结论：删除
- 理由：
  - 核心逻辑围绕根层 `PROGRESS.md` / `plans/PROGRESS.md`
  - 当前正式契约已经转到 `.codex/progress/active/<task-id>/current.md`
  - 继续保留只会让脚本层继续绑定错误进度格式

### 4.9 `.codex/scripts/runtime/queue.mjs`

- 顶层函数：`upsertPendingAction`、`removePendingActions`、`upsertGovernanceQueueItem`、`trimRuntimeState`
- 结论：删除
- 理由：
  - 完全服务于被删除的 event-driven runtime state 子系统

### 4.10 `.codex/scripts/runtime/registry.mjs`

- 顶层函数：`slugifyTaskValue`、`createTaskMatchKey`、`createTaskId`、`normalizeTaskStatus`、`isOpenTaskStatus`、`hasUnsettledStatus`、`compareTaskTimestamps`、`nextTaskSequence`、`findLatestTaskIndex`、`writeTaskField`、`sortAndTrimRegistry`、`upsertTaskRegistryTask`、`parkTaskIfNeeded`、`getCurrentTaskRecord`、`listTaskRegistryTasks`、`normalizeTaskId`、`resolveActiveTask`、`syncTaskRegistry`
- 结论：删除
- 理由：
  - 任务注册表在当前 shipped scripts 中没有真实维护者
  - 之前只被 `writeback` 启动时写空壳
  - “历史任务/冷任务”能力在当前产品里未落地，继续保留注册表脚本只是假完整性

### 4.11 `.codex/scripts/runtime/state-delivery.mjs`

- 顶层函数：`normalizeToken`、`isProductAssistantPhaseToken`、`isNonCodeRouteByProfile`、`isNonCodeRouteByWorkflow`、`hasProductAssistantSignal`、`isNonCodeDeliveryRoute`、`shouldQueueByPolicy`、`detectMissingTaskImplementationBrief`、`recordMissingTesterWorkflowBreak`、`submitLooksReady`、`shouldQueueSubmitAfterCompletion`、`shouldQueueSubmitAfterQc`、`maybeQueueSubmitForSettledTask`、`shouldBlockSettlementForMissingTester`、`blockSettlementForMissingTester`、`processQcOutcome`、`processSubmitOutcome`
- 结论：删除
- 理由：
  - 整个文件建立在事件驱动执行链状态自动化上
  - 当前没有接入点

### 4.12 `.codex/scripts/runtime/state-normalizers.mjs`

- 顶层函数：`normalizeEventName`、`normalizeRole`、`normalizeMessage`、`normalizeStatus`、`normalizeWorkflowPhase`、`normalizeWorkflowChainId`、`structuredChainId`、`resolveWorkflowChainId`、`sanitizeChainScopeSegment`、`generateWorkflowChainId`、`workflowChainMatches`、`normalizeStringList`、`defaultGovernanceDisposition`、`normalizeGovernanceCandidates`、`normalizeProductMemoryUpdates`、`normalizeProductTemplateChanges`、`normalizeProductOpenGaps`、`normalizeProductGovernanceCandidates`
- 结论：删除
- 理由：
  - 主要职责是吃掉事件别名、角色别名、workflow 字段别名和 product structured result
  - 对当前 shipped scripts 来说，这整层已经没有 owner
  - 也是明显的兼容层堆积点

### 4.13 `.codex/scripts/runtime/state-reviews.mjs`

- 顶层函数：`governanceLevelForRetryCount`、`defaultGovernanceDisposition`、`upsertSessionRetrospective`、`upsertGovernanceReview`、`recordArchitectRetrospective`、`reviewLevelForProductResult`、`recordProductAssistantReview`
- 结论：删除
- 理由：
  - 服务于治理自动化和 execution-state pipeline
  - 当前没有真实落地链路

### 4.14 `.codex/scripts/runtime/state-workflow.mjs`

- 顶层函数：`currentTaskLabel`、`buildTaskContextWorkflowPatch`、`normalizeWorkflowTaskId`、`workflowScopeMatches`、`resolveWorkflowScopedTaskId`、`resolveRuntimeTaskId`、`inferWorkflowPhaseFromChain`、`updateWorkflowState`、`markWorkflowRequiresTesterHandoff`、`markWorkflowTesterHandoffCompleted`、`markWorkflowSettled`、`workflowRequiresTesterHandoff`、`hasPendingQc`、`hasPendingSubmit`、`queueSubmit`、`queueTesterHandoff`、`clearExecutionContinuation`、`clearTesterHandoff`、`hasPendingTesterHandoff`、`hasRequiredTesterHandoff`、`syncWorkflowExpectedNextStep`、`hasHotTaskState`、`hasOutstandingCompletionWork`、`upsertCompletedTask`、`clearHotTaskState`、`shouldCompressCompletedTask`、`resolveQcPhaseForMetrics`、`recordQcMetrics`、`matchesTaskScope`、`isAmbiguousTaskScope`、`clearAmbiguousBlockedSignals`、`hasAmbiguousBlockedSignals`
- 结论：删除
- 理由：
  - 完整但未接线
  - 状态字段复杂、层级深、对外没有真实驱动
  - 是本次“互相套娃引用但并不代表有效”的典型样本

### 4.15 `.codex/scripts/runtime/state.mjs`

- 顶层函数：`recordSubagentResult`、`recordSessionEnd`、`recordTaskSettled`、`main`
- 结论：删除
- 理由：
  - 整个事件入口没有接到 hooks
  - 手动调用时缺少 event 就 `ignored`
  - 当前产品中并不是一个真正可用的 shipped runtime entry

### 4.16 `.codex/scripts/runtime/store-shapes.mjs`

- 顶层函数：`normalizeWorkflowToken`、`normalizeWorkflowChainId`、`normalizeWorkflowPathReference`、`normalizeWorkflowReason`、`inferWorkflowPhase`、`createEmptyTaskWorkflowState`、`normalizeTaskWorkflowState`、`createEmptyTaskContext`、`createEmptyRepoContext`、`createEmptyDeliveryPolicy`、`createEmptyAideGovernancePolicy`、`createEmptyState`、`createEmptyTaskRegistry`、`createEmptyGovernanceRegistry`、`normalizeGovernanceLevel`、`normalizeGovernanceDisposition`、`normalizeGovernanceCandidateEntry`、`normalizeGovernanceQueueItem`、`normalizeGovernancePendingAction`、`normalizeRuntimeStateShape`、`normalizeGovernanceRegistryShape`、`normalizeSubmitQueueAfter`
- 结论：删除
- 理由：
  - 这个文件本质上是给“太多半成品状态结构”兜底
  - 其中大部分 shape 在当前真实脚本集里都没有 owner
  - `workflow` / `runtime-state` / `governance-registry` / `repo-context` / `task-registry` 在 shipped scripts 中都不应继续伪装成已落实能力

### 4.17 `.codex/scripts/runtime/store.mjs`

- 顶层函数：`loadJsonFile`、`loadRuntimeState`、`saveRuntimeState`、`loadDeliveryPolicy`、`loadAideGovernancePolicy`、`loadTaskRegistry`、`saveTaskRegistry`、`loadTaskContext`、`saveTaskContext`、`saveRepoContext`、`loadGovernanceRegistry`、`saveGovernanceRegistry`、`loadProjectProfileState`
- 结论：删除
- 理由：
  - 绑定太多已删除 state/policy abstractions
  - 当前最小有效脚本集不需要统一 runtime store

### 4.18 `.codex/scripts/runtime/structured.mjs`

- 顶层函数：`normalizeGovernanceLevel`、`compareGovernanceLevel`、`highestGovernanceLevel`、`normalizeText`、`compactText`、`extractStructuredResult`、`extractStructuredResultFromRequiredSection`、`normalizeStructuredRole`、`normalizeStructuredBriefPath`、`isValidImplementationBriefPath`、`validateStructuredResultContract`、`detectSubagentStatus`、`detectQcPass`、`detectQcFail`、`detectQcPhase`、`detectTaskCompletionMessage`、`detectFailureCategories`、`suggestedRoutesForCategory`、`recommendedActionForCategory`、`toGovernanceItemId`
- 结论：删除
- 理由：
  - 绝大部分能力都是为 deleted runtime/governance pipeline 服务
  - 包括大量宽松猜测解析、fallback JSON 提取、历史 scope key 兼容
  - 当前最小有效脚本集只需要很轻的当前任务概览，不需要这层复杂结构化语义引擎

### 4.19 `.codex/scripts/guards/validate-git.mjs`

- 顶层函数：`isBroadGitAddCommand`、`main`
- 结论：删除并归档缺口
- 理由：
  - 当前仓库内无法证明它就是“产品正确 git 门禁实现”
  - 但从产品需求角度看，git 门禁仍可能应该存在
  - 所以本次删除旧实现，同时把能力缺口归档，不做伪补

### 4.20 `.codex/scripts/logs/analyze.mjs`

- 顶层函数：`printUsage`、`parseNumberArg`、`parseArgs`、`normalizePath`、`listJsonlByLatestDay`、`resolveHooksInput`、`resolveLogFiles`、`safeJsonParse`、`readJsonlFiles`、`countBy`、`groupBy`、`toMillis`、`safeDurationSeconds`、`extractCommand`、`isReadCommand`、`isDeepImplementationRead`、`analyzeMemoRisk`、`extractTurnSummary`、`analyzePrePostMismatches`、`readSessionMeta`、`analyzeRoleTracks`、`analyzeRuntimeSignals`、`buildHandoffIssues`、`summarizeSessions`、`analyzeLogBundle`、`buildTextSummary`、`runCli`
- 结论：删除
- 理由：
  - 没有任何当前产品入口
  - 它的存在只是在分析自身产物，不是 starter 核心运行能力
  - 留下它只会扩大 scripts 面积

## 5. 历史上可靠但本次被移除的机制

这部分单独记录“技术上曾经能稳定工作，但本次仍被移除”的机制，避免把“已删除”误读成“以前一定不可用”。

### 5.1 启动包装器

- 文件：`.codex/scripts/context/startup.mjs`
- 历史可靠性：存在
- 说明：
  - 这个脚本过去能稳定串行执行 `task-overview -> governance/writeback -> context/session`
  - 它本身不是坏代码
- 本次仍删除的原因：
  - 它包装的两段下游能力并不是当前真实落地能力
  - 保留 wrapper 只会继续放大空转子系统
- 风险判断：低
  - 已用 `hooks.json` 直接改为调用 `task-overview`

### 5.2 Legacy Progress 解析链

- 文件：
  - `.codex/scripts/runtime/progress.mjs`
  - `.codex/scripts/runtime/registry.mjs`
  - 旧版 `.codex/scripts/context/task-overview.mjs`
- 历史可靠性：存在
- 说明：
  - 这条链过去确实能从根层 `PROGRESS.md` 或 `plans/PROGRESS.md` 解析当前、阻塞、完成任务
  - 不是代码坏掉，而是依赖的进度格式已经不再是当前唯一契约
- 本次仍删除的原因：
  - 当前正式契约已经转到 `.codex/progress/active/<task-id>/current.md`
  - 如果继续保留，会让脚本层继续绑定错误格式
- 风险判断：中
  - 如果目标仓库仍有人手工维护旧 `PROGRESS.md`，这次会失去自动解析能力

### 5.3 宽输入别名兼容

- 文件：`.codex/scripts/shared/project-context.mjs`
- 历史可靠性：存在
- 被移除内容：
  - `project_dir`
  - `repoRoot`
  - `repo_root`
  - `repoPath`
  - `repo_path`
  - `workdir`
  - `workspace`
  - `tool_input.*`
- 本次仍删除的原因：
  - 当前真实输入证据只覆盖 `CODEX_PROJECT_DIR`、`input.projectDir`、`input.cwd`、`process.cwd`
  - 其余别名属于历史兼容面，不再保留
- 风险判断：中
  - 如果外部调用方仍在传这些旧字段，会在本次清理后失效

### 5.4 Legacy Runtime Log 迁移

- 文件：`.codex/scripts/shared/logging.mjs`
- 历史可靠性：存在
- 被移除内容：
  - `runtime-hooks.jsonl -> runtime-hooks/<day>.jsonl` 迁移逻辑
  - 基于 active logger 的 file write trace
- 本次仍删除的原因：
  - 两者都服务于已经删除的旧状态子系统或旧日志格式
  - 当前最小有效脚本集只需要 invocation 级日志
- 风险判断：低
  - 只影响旧日志连续迁移，不影响当前最小脚本集运行

### 5.5 需要明确区分的情况

- `runtime/state.mjs`、`state-workflow.mjs`、`state-delivery.mjs`、`state-reviews.mjs`、`queue.mjs`
  - 这些文件代码量大、内部自洽、技术上不算粗糙
  - 但当前 hooks 并没有把它们接上
  - 所以它们不计入“被误砍的当前可靠运行机制”，而计入“未落地的半成品子系统”

## 6. 当前判断：是否砍掉了历史上可靠的运行机制

结论分两层：

1. 没看到“当前已经接线、持续提供真实结果”的核心 shipped 运行机制被明显误砍。
2. 确实砍掉了几类“历史上技术上可靠”的机制，但这些机制大多属于旧兼容层或未完成子系统。

当前最需要继续观察的风险点只有两个：

1. 旧 `PROGRESS.md` 自动解析能力
2. 外部调用方若仍传旧 project-dir/workdir/repoRoot 类字段

如果后续确认目标仓库还依赖这两类能力，应按当前契约重新设计补回，而不是恢复原脚本。

## 7. 同步调整的非脚本文件

为保持脚本清理后的契约一致，本次同步调整：

1. `codex-starter/.codex/hooks.json`
   - `SessionStart` 直接调用 `context/task-overview.mjs`
   - 不再经过已删除的 `context/startup.mjs`

2. `codex-starter/AGENTS.md`
   - 移除 `.codex/policies/aide-writeback-policy.json` 的 authority map 条目

3. `standards/codex-starter-authority-map.json`
   - 收掉已经纯历史化的禁词：
     - `startup-context.mjs`
     - `session-context.mjs`
     - `task-overview.mjs`
     - `aide-writeback.mjs`
     - `aide-evolution.mjs`
     - `aide-governance.mjs`
     - `runtime-state.mjs`
     - `validate-git.mjs`
     - `workflow_chain_id`
   - 保留当前仍有意义的路径级约束

4. `codex-starter/.codex/skills/aide/SKILL.md`
   - 删除对 `task-registry`、`governance-registry`、`repo-context`、writeback/audit/session/runtime-state 的依赖描述
   - 保留 `task-overview` 与 `validate-validation-profile` 两条真实规则

5. `codex-starter/.codex/policies/routing-policy.md`
   - 删除 `task-registry`、`repo-context`、`runtime-state` 这些当前脚本不再维护的 durable state 描述

6. `codex-starter/.codex/agents/tester.toml`
   - 删除 `workflow_chain_id` 要求

7. `codex-starter/.codex/templates/execution/validation-handoff.md`
   - 删除 `Workflow Chain ID`

8. `codex-starter/.codex/defaults/state/task-context.json`
   - 删除 `workflow` 子树
   - 删除“cached repo context”模块文案

9. 删除默认 state / policy 文件
   - `.codex/defaults/state/repo-context.json`
   - `.codex/defaults/state/task-registry.json`
   - `.codex/policies/aide-writeback-policy.json`

## 8. 归档缺口

本次不补，只归档：

### 6.1 Git 门禁缺口

- 现状：`validate-git.mjs` 删除
- 判断：仓库级安全门禁仍可能需要，但当前旧脚本不足以证明自己是正确实现
- 结论：缺口成立，后续若补，应按当前提交/推送策略重新设计，而不是恢复旧文件

### 6.2 执行链热状态自动化缺口

- 现状：`runtime/state.mjs` 及整条 state pipeline 删除
- 判断：原实现没有 hook 接入，属于未落地能力
- 结论：如果后续仍需要 coder/tester/qc/submit 的热状态推进，应该基于真实事件入口重新设计

### 6.3 自动治理写回缺口

- 现状：`governance/writeback.mjs` 和 `aide-writeback-policy.json` 删除
- 判断：原实现没有真实候选来源，只会周期性写空状态
- 结论：如果后续仍要做治理自动写回，应先定义真实触发源和安全边界

### 6.4 任务历史注册表缺口

- 现状：`task-registry` 相关脚本与默认 state 删除
- 判断：旧实现没有真实维护链路
- 结论：当前 shipped scripts 只支持“当前任务概览”，不支持自动历史记录

### 6.5 Repo Context 缓存缺口

- 现状：`repo-context` 默认 state 与脚本 owner 删除
- 判断：旧实现没有真实维护者
- 结论：如果后续仍要保留 repo facts cache，需要明确谁写、何时写、谁消费

## 9. 当前剩余 scripts 目录

清理后的 `codex-starter/.codex/scripts` 只剩：

- `context/task-overview.mjs`
- `guards/validate-validation-profile.mjs`
- `shared/io.mjs`
- `shared/logging.mjs`
- `shared/project-context.mjs`

这就是本次审计认可的最小有效脚本集。

## 10. 验证

本次清理后至少应验证：

- `node .codex/scripts/context/task-overview.mjs`
- `node .codex/scripts/guards/validate-validation-profile.mjs`
- `node .codex/hooks/log-event.mjs`
- `node scripts/validate-codex-starter-dev.mjs full`

额外核对：

- `SessionStart` hook 只调用真实存在且有实际输出价值的脚本
- 版本化文件中不再引用已删除的 state/runtime/governance 自动化脚本

## 11. 会话收尾补充

以下事项本次未继续实现，只保留为后续决策项：

1. `git` 门禁是否要以新设计补回
   - 当前旧脚本已删除
   - 若要恢复，应该基于当前提交/推送策略单独设计，不应恢复旧实现

2. 旧 `PROGRESS.md` 使用方是否仍存在
   - 如果仍有目标仓库依赖根层 `PROGRESS.md` / `plans/PROGRESS.md`
   - 需要决定是迁移到 `.codex/progress/**`，还是补一个新的迁移/读取层

3. 外部调用方是否仍传旧 project-dir 别名
   - 当前 `project-context.mjs` 只保留 `CODEX_PROJECT_DIR`、`input.projectDir`、`input.cwd`、`process.cwd`
   - 如果现网还有 `repoRoot` / `workdir` / `workspace` 一类调用，需要单独确认再决定是否重新支持

4. 执行链状态自动化是否还要存在
   - 当前整条 `runtime/state` 子系统已经删除
   - 如果产品后续仍需要 coder/tester/qc/submit 热状态推进，应按真实 hook 事件重新设计，而不是恢复旧脚本

5. 自动治理写回是否还要存在
   - 当前 `governance/writeback` 已删除
   - 如果后续仍要做自动写回，必须先定义真实触发源、安全边界和目标 owner

本次文档到这里为止，后续如果继续开新会话，应以这份文档为基线，而不是回退到上一版清理结论。
