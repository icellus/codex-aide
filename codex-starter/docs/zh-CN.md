# 中文文档索引

英文文档是主版本。
中文文档是同步说明。

这份文档只做中文入口导航，不再重复整套规则正文。
运行时权威在 `AGENTS.md`、`.agents/skills/*/SKILL.md` 和 `.codex/routing-policy.md`。

建议阅读顺序：

1. [`README.md`](../README.md)
2. [`overview.md`](./overview.md)
3. [`usage.md`](./usage.md)
4. [`detailed-guide.md`](./detailed-guide.md)

对应中文同步文档：

1. [`overview.zh-CN.md`](./overview.zh-CN.md)
2. [`usage.zh-CN.md`](./usage.zh-CN.md)
3. [`detailed-guide.zh-CN.md`](./detailed-guide.zh-CN.md)

快速说明：

- `coding` 线用于代码、验证、审计、受控交付
- `product` 线用于文档和其他非代码产物
- discussion 回合默认由 `/Aide` 直接负责
- 当前没有独立 repo scan 脚本，scan 由 `/Aide` 通过针对性检索完成
- `/Aide` 负责判断是否进入正式执行流，`conduct` 负责在需要时应用 delivery routing
