# agent-skills

[English](README.md)

这个仓库当前只维护 `codex-aide`。
英文根文档是本仓库的默认展示版本；如有歧义，以英文主文件为准。

安装后的运行时权威以目标仓库中的以下文件为准：

- `AGENTS.md`
- `.codex/skills/*/SKILL.md`
- `.codex/policies/routing-policy.md`

源码入口：

- [codex-aide/README.md](codex-aide/README.md)
- [codex-aide/AGENTS.md](codex-aide/AGENTS.md)

项目文档：

- [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)
- [TESTING.zh-CN.md](TESTING.zh-CN.md)
- [SUPPORT.zh-CN.md](SUPPORT.zh-CN.md)
- [SECURITY.zh-CN.md](SECURITY.zh-CN.md)
- [CODE_OF_CONDUCT.zh-CN.md](CODE_OF_CONDUCT.zh-CN.md)
- [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)

## 目录结构

- [codex-aide](codex-aide)：对外发布的 starter 产品内容
- [scripts](scripts)：仓库维护脚本与开发校验入口
- [standards](standards)：开发校验使用的规则数据
- [fixtures](fixtures)：最小反例与行为夹具
- [.githooks](.githooks)：本地 Git hook 接线
- [.github](.github)：GitHub 自动化与协作模板

说明：

- 旧的 `tests/codex-aide/` 测试脚本已移除，不再作为仓库默认验证入口
- 通用仓库维护仍以任务相关的最小验证或明确记录“未验证”为准
- `codex-aide` 开发校验遵循 [TESTING.zh-CN.md](TESTING.zh-CN.md)

`claude-starter` 已迁移为独立仓库：<https://github.com/icellus/claude-starter>

## 社区与协作

- 贡献流程：[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)
- 支持边界：[SUPPORT.zh-CN.md](SUPPORT.zh-CN.md)
- 安全报告：[SECURITY.zh-CN.md](SECURITY.zh-CN.md)
- 行为准则：[CODE_OF_CONDUCT.zh-CN.md](CODE_OF_CONDUCT.zh-CN.md)
- 版本变化：[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)

## 许可证

本仓库使用 [MIT License](LICENSE)。
