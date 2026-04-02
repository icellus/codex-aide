# 贡献指南

[English](../CONTRIBUTING.md)

如有歧义，以英文主文件为准。

## Commit Message

使用：

```text
<type>: <subject>
```

允许的 `type`：

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `ci`
- `build`
- `perf`
- `revert`

权威来源：`scripts/commit-policy.mjs`

建议保持简单：

- 单行 subject
- 不超过 120 个字符
- 末尾不要带标点
- 直接说明改了什么，不要写 `wip`、`misc`、`update`

示例：

```text
feat: add commit policy validation
fix: split oversized smoke coverage
docs: document hook setup
```

## 启用本地 Hook

```bash
bash scripts/install-git-hooks.sh
```

## 手动校验

```bash
node scripts/validate-commit-msg.mjs --message "fix: split oversized smoke coverage"
node scripts/validate-commit-msg.mjs --range HEAD~5..HEAD
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs full
```

开发校验器会在隔离的临时镜像中运行，不应在宿主工作区生成 repo 根级 `.codex/` 等运行态目录。

开发校验策略与测试资产规则见 [../TESTING.md](../TESTING.md) 与 [TESTING.zh-CN.md](TESTING.zh-CN.md)。
这些命令在手工执行、通过 Codex 执行、通过其他 AI 助手执行，或在 CI 中执行时都应保持一致。
