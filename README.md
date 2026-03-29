# agent-skills

这个仓库当前只维护：

- `codex-starter`

注意：

- 根目录 [AGENTS.md](/workspace/agent-skills/AGENTS.md) 只用于本仓库维护
- [codex-starter/AGENTS.md](/workspace/agent-skills/codex-starter/AGENTS.md) 才是 starter 安装到目标仓库后的运行时权威

## 安装说明

### `codex-starter`

在目标项目根目录执行：

```bash
bash /path/to/agent-skills/codex-starter/install.sh
```

`claude-starter` 已从本仓库迁出，不再在这里维护。
归档说明见：[CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md)

## 文档

- Codex: [codex-starter/README.md](/workspace/agent-skills/codex-starter/README.md)
- Claude 归档说明: [CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md)

## 测试

仓库级测试统一放在根目录：

- [tests/codex-starter/README.md](/workspace/agent-skills/tests/codex-starter/README.md)

常用入口：

```bash
node tests/codex-starter/run.mjs
node tests/codex-starter/run.mjs --file codex-starter/AGENTS.md
node tests/codex-starter/run.mjs --suite smoke
node tests/codex-starter/run.mjs --suite full
```

默认建议：

- 主线程直接跑 `node tests/codex-starter/run.mjs`，按当前 worktree 自动选最小 suite
- 子线程有明确 write set 时，跑 `node tests/codex-starter/run.mjs --file <path> ...`
