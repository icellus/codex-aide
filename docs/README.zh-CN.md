# agent-skills

[English](../README.md)

这个仓库当前只维护 `codex-aide`。
英文根文档是本仓库的默认展示版本；如有歧义，以英文主文件为准。

安装后的运行时权威以目标仓库中的以下文件为准：

- `AGENTS.md`
- `.codex/skills/*/SKILL.md`
- `.codex/policies/routing-policy.md`

源码入口：

- [codex-aide/README.md](../codex-aide/README.md)
- [codex-aide/AGENTS.md](../codex-aide/AGENTS.md)

项目文档：

- [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)
- [TESTING.zh-CN.md](TESTING.zh-CN.md)
- [SUPPORT.zh-CN.md](SUPPORT.zh-CN.md)
- [SECURITY.zh-CN.md](SECURITY.zh-CN.md)
- [CODE_OF_CONDUCT.zh-CN.md](CODE_OF_CONDUCT.zh-CN.md)

## 目录结构

- [codex-aide](../codex-aide)：对外发布的 starter 产品内容
- [scripts](../scripts)：仓库维护脚本与开发校验入口
- [tests](../tests)：开发校验资产，包含规则数据与夹具
- [docs](.)：补充文档与中文镜像
- [.githooks](../.githooks)：本地 Git hook 接线
- [.github](../.github)：GitHub 自动化与协作模板

说明：

- 旧的固定测试运行器布局已从本仓库移除
- 通用仓库维护仍以任务相关的最小验证或明确记录“未验证”为准
- `codex-aide` 开发校验遵循 [TESTING.zh-CN.md](TESTING.zh-CN.md)

`claude-starter` 已迁移为独立仓库：<https://github.com/icellus/claude-starter>

## 社区与协作

- 贡献流程：[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)
- 支持边界：[SUPPORT.zh-CN.md](SUPPORT.zh-CN.md)
- 安全报告：[SECURITY.zh-CN.md](SECURITY.zh-CN.md)
- 行为准则：[CODE_OF_CONDUCT.zh-CN.md](CODE_OF_CONDUCT.zh-CN.md)

## 许可证

本仓库使用 [MIT License](../LICENSE)。
