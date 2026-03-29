# Discussion Current

Updated: 2026-03-29 17:40 Asia/Shanghai
Source: `discussion/history/2026-03-29-1740-story-term-next-context.md`

## 当前状态

本仓库当前只维护 `codex-starter`。
`claude-starter` 已迁出到仓库外单独归档，仓库内只保留说明文件：

- [CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md)

当前没有未解决 blocker。
这次会话里已完成的修复包括：

- 宿主与 `codex-starter` authority 边界收紧
- `workflow.phase + chain_id` 落地到 runtime hot state
- `tester` handoff 新增 `workflow_chain_id`
- 受保护链路下，`workflow_chain_id` 缺失或不匹配都会阻断 handoff
- `session_end` 已收紧为 best-effort cleanup，不再推进 QC / submit / settle

完整验证已通过：

```bash
node tests/codex-starter/run.mjs --suite full
```

## 下一轮唯一焦点

下一轮不要再回到宿主层，也不要回到基础 handoff 收紧。
唯一焦点是：

- `story` 这个词在 `codex-starter` 中是否应该继续存在

## 对 `story` 的当前判断

- `story` 很像历史词
- 但它不是死词，仍在真实 runtime 中承担工作单元语义：
  - `PROGRESS.md`
  - `plans/*.md`
  - `story_path / storyPath`
  - task registry 的 `story:<path>`
- 因此不能把它当纯文案残留直接删掉

## 下次建议切入顺序

1. 先逐点确认 `story` 在 runtime/state/registry 中到底表示什么
2. 再决定是“保留这个词并重新定义”，还是“迁移到更中性的词”
3. 如果迁移，再设计兼容边界与迁移顺序

## 测试与验证提醒

仓库维护测试统一走：

```bash
node tests/codex-starter/run.mjs
```

如果是明确 write set 的定向验证，优先走：

```bash
node tests/codex-starter/run.mjs --file <path> --file <path>
```

如果改动涉及 runner / manifest / shared helpers / 多层测试结构，直接跑：

```bash
node tests/codex-starter/run.mjs --suite full
```

## 关联历史

- `discussion/history/2026-03-29-1740-story-term-next-context.md`
- `discussion/history/2026-03-29-1626-discussion-direction-sync.md`
- `discussion/history/2026-03-29-1612-next-session-bootstrap.md`
