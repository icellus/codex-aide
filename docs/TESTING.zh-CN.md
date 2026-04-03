# 测试与开发校验

[English](../TESTING.md)

本文件说明 `codex-aide` 在当前仓库中的开发期校验方式。

它服务于这个仓库本身的维护，不是安装到目标仓库后的运行期使用说明。

## 范围

这里的开发校验主要覆盖：

- `scripts/` 下的校验入口
- `tests/standards/` 下的规则数据
- `tests/fixtures/codex-aide-dev/` 下的夹具
- hooks 和 CI 使用的校验方式

这些文件属于开发治理资产。它们的作用是保持运行时和仓库实现的一致性，但它们本身不是运行时权威。

## 默认命令

统一使用这个校验器：

```bash
node scripts/validate-codex-aide-dev.mjs contract
node scripts/validate-codex-aide-dev.mjs consistency
node scripts/validate-codex-aide-dev.mjs meta
node scripts/validate-codex-aide-dev.mjs full
```

默认含义：

- `contract`：可执行契约检查
- `consistency`：跨文件一致性检查
- `meta`：校验系统自身健康检查
- `full`：以上全部

本地迭代时，优先跑最小且相关的模式。
涉及测试或校验行为本身的改动，在收尾时优先跑 `full`。

## 如何理解这几层

- `contract`：看契约是否仍然按实现工作
- `consistency`：看相关文件之间是否仍然一致
- `meta`：看校验系统本身是否仍然健康、可维护

保持边界清楚：

- 可执行行为放在校验器和夹具里
- 跨文件对齐放在 consistency 数据里
- 校验系统自身健康放在 meta 层

## 权威来源

本仓库的开发校验由以下内容共同定义：

- [AGENTS.md](../AGENTS.md)
- [TESTING.md](../TESTING.md)
- [scripts/validate-codex-aide-dev.mjs](../scripts/validate-codex-aide-dev.mjs)
- [scripts/validate-codex-aide-authority.mjs](../scripts/validate-codex-aide-authority.mjs)
- [tests/standards/codex-aide-authority-map.json](../tests/standards/codex-aide-authority-map.json)
- [tests/standards/codex-aide-consistency-map.json](../tests/standards/codex-aide-consistency-map.json)
- [tests/standards/codex-aide-test-registry.json](../tests/standards/codex-aide-test-registry.json)
- [tests/fixtures/codex-aide-dev](../tests/fixtures/codex-aide-dev)

## 维护规则

- 保持校验以注册表驱动为主。优先更新已有规则数据、夹具和执行器，而不是不断新增。
- 当校验命令、layer、注册表要求或维护流程发生变化时，应在同一次改动里同步更新本文件。
- 不要把这个文件写成所有细规则的第二份拷贝。更细的规则应该放在校验器、standards 数据、fixtures 和 owner 文件里。
- 有效校验器应至少保留一条可维护的 failing proof 路径。

## 交付期望

当你修改测试或校验行为时，应说明：

- 跑了什么
- 这些检查覆盖什么
- 覆盖是否发生变化
- 还剩下什么校验缺口
