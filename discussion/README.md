# discussion

本目录用于保存“下次会话可直接续接”的上下文，不做完整对话归档。

默认读取顺序：

1. `discussion/prefs.md`
2. `discussion/current.md`
3. 如果 `current.md` 指向了某条历史，再读对应的 `discussion/history/*.md`

默认收尾顺序：

1. 在 `discussion/history/` 追加一条新记录
2. 更新 `discussion/current.md`
3. 只有长期偏好或稳定约束变化时，才更新 `discussion/prefs.md`

文件职责：

- `prefs.md`：长期稳定的偏好、仓库边界、常用验证入口
- `current.md`：当前有效状态、下一步、相关文件、关联历史
- `history/*.md`：一次任务一条记录，只追加，不作为默认全量加载内容

历史文件命名：

- 使用 `YYYY-MM-DD-HHMM-<slug>.md`
- 时间统一用 `Asia/Shanghai`
- 颗粒度至少到小时和分钟，避免同一天多次记录互相覆盖

约束：

- `current.md` 始终表示唯一当前态
- `history/` 只做追溯，不堆叠进默认上下文
- 详细过程交给代码、测试、日志和 Git，`discussion/` 只保留续接必需信息
- `discussion/*` 默认不属于仓库测试范围，除非以后你明确要求把某部分流程脚本化
