# agent-skills

这个仓库当前只维护 `codex-starter`。

## 安装

在目标项目根目录执行：

```bash
bash /path/to/agent-skills/codex-starter/install.sh
```

当前安装器默认会删除目标项目中的 `AGENTS.md`、`.codex/`，以及旧版遗留的 `.agents/`、`.product/`，然后完整复制新的 starter。

安装后的运行时权威以目标仓库中的以下文件为准：

- `AGENTS.md`
- `.codex/skills/*/SKILL.md`
- `.codex/policies/routing-policy.md`

源码入口：

- [install.sh](/workspace/agent-skills/codex-starter/install.sh)
- [codex-starter/AGENTS.md](/workspace/agent-skills/codex-starter/AGENTS.md)

贡献入口：

- [CONTRIBUTING.md](/workspace/agent-skills/CONTRIBUTING.md)
- [TESTING.md](/workspace/agent-skills/TESTING.md)

## 目录结构

- [codex-starter](/workspace/agent-skills/codex-starter): 对外发布的 starter 产品内容
- [scripts](/workspace/agent-skills/scripts): 仓库维护脚本与开发校验入口
- [standards](/workspace/agent-skills/standards): 开发校验使用的规则数据
- [fixtures](/workspace/agent-skills/fixtures): 开发校验的最小反例资产
- [.githooks](/workspace/agent-skills/.githooks): 本地 Git hook 接线
- [.github](/workspace/agent-skills/.github): 仓库自动化配置

说明：

- 旧的 `tests/codex-starter/` 测试脚本已移除，不再作为仓库默认验证入口
- 通用仓库维护仍以任务相关的最小验证或明确记录“未验证”为准
- `codex-starter` 开发校验遵循 [TESTING.md](/workspace/agent-skills/TESTING.md)

`claude-starter` 已从本仓库迁出，归档说明见：[CLAUDE_STARTER_ARCHIVE.md](/workspace/agent-skills/CLAUDE_STARTER_ARCHIVE.md)
