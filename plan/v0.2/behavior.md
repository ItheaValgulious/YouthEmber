# Behaviors

## 架构

- 本版采用“原生优先 + Web fallback”。
- iOS / Android 是主要演示平台；Web 保留为开发预览、导入导出和能力降级路径。
- 所有数据本地保存，不依赖服务端同步。
- Push / Pull、服务端同步都不在本版范围内，`token` 仅预留。
- 不再提供单独的时区设置，统一使用当前运行环境时区。

## 当前存储方案

- 业务主状态以单个 `AppState` 快照形式持久化。
- 原生端通过 `DatabaseService` 写入 SQLite，但当前使用的是 KV 结构，而不是分表结构：
  - SQLite 中维护 `kv_store`
  - `app_state` 作为主 key，值为整包 JSON
- Web fallback 通过 Capacitor Preferences 存储同样的 `AppState` JSON。
- 媒体资源不内嵌进 `AppState`，而是写入 Filesystem 的应用数据目录；Event 里只保存相对路径与元数据。
- Friend 记忆单独存成文本文件，由 `memory_path` 指向。
- UI 偏好（如语言、纸张主题）单独按 key 存储，但在导出时会和业务数据一起打包。

## AI 调度

- AI 请求由应用内后台队列调度，不依赖服务端。
- AI 请求失败后进入重试队列，默认重试 3 次，间隔为 1 分钟、5 分钟、10 分钟。
- Event / Task 先落库，再异步补齐 AI 结果。
- AI 失败不阻塞主流程，只留下待重试任务。

## AI 输出约定

全部采用 JSON 结构化输出。

当 AI 参与事件/任务生成时，输出结构统一为：

- title: string，可为空
- tags: Tag 列表，可为空

当 AI 作为 Friend 进行评论时，输出内容为：

- attitude: float
- comment: string
- memory: string；更新后的完整记忆文本

当 AI 进行总结时，输出内容为：

- title: string
- task_summary: string
- mood_summary: string
- overall_summary: string

补充规则：

- 用户已经填写的标题、正文、标签永远不被 AI 覆盖。
- 若目标模型不支持图片输入，可先使用首个支持图片输入的模型生成图片摘要，再把摘要喂给目标模型。

## Handler

### on_event_create

当创建一个 Event 时：

1. 立即保存 Event
2. 若 `title` 为空，则允许 AI 生成标题
3. AI 生成的标签与用户手填标签做并集，不覆盖用户输入
4. 为每个启用的 Friend 生成一个候选评论

Friend 评论规则：

- AI 必须返回 `attitude`、`comment`、`memory`
- 基础回复权重为 `active * attitude`
- 当前实现中：
  - 针对 Event 创建或用户追加 Comment 触发的首轮回复，直接使用该基础值
  - 针对 Friend 间继续回复的链路，使用 `clamp(active * attitude, 0, 1) * ai_active`
- 实际延迟分钟数：`round((latency + attitude * (1 - attitude)) * 60)`
- Demo 里会把延迟缩放到更短时间，便于预览异步效果
- 同一 Event 不设硬性的回复数量上限

### on_task_create

创建 Task 时：

- Task 本质上也是 Event，但会自动加上 `task` 与 `ongoing` tag
- 当前 Tasks 页输入框不拆 title / raw：
  - 全文直接写入 `raw`
  - `title` 初始留空，允许 AI 后补
- 若 `time` 不为空，则创建对应的提醒 schedule
- 若 `time = null`，则不创建提醒
- AI 与 Friend 在读取上下文时应知道这是一个 Task

### on_task_complete

当用户完成 Task 时：

- 移除旧 schedule
- 移除 `ongoing` tag
- 添加 `finished` tag
- 保留 `task` tag
- 将 `time` 更新为完成时间
- 触发 Friend 评论
- 不能再改回未完成

### on_task_fail

Task 失败有两种来源：

- 用户主动点击“放弃”
- 到期当天结束时仍未完成

处理规则：

- 移除旧 schedule
- 移除 `ongoing` tag
- 添加 `not_finished` tag
- 保留 `task` tag
- 将 `time` 更新为失败时间
- 触发 Friend 评论
- 失败后不能再改回完成

### on_task_timeup

提醒规则：

- `config.pre_alert` 是提前天数，类型为 int
- `config.alert_time` 是本地提醒时间，默认 `"09:00"`
- 若 `pre_alert = 0`，只在截止当天提醒一次
- 若 `pre_alert > 0`，则在“提前 `pre_alert` 天的 `alert_time`”提醒一次，并在截止当天再提醒一次
- 点击通知后进入该 Task 的 Detail 页面
- 原生端使用 `Local Notifications`
- Web fallback 下使用定时器调起浏览器通知

超时规则：

- “当天结束”按当前运行环境本地时间的 `24:00` 计算
- 若到 `24:00` 时仍带有 `ongoing` tag，则触发 `on_task_fail`

任务变更规则：

- 修改 Task 时间时，先删除旧 schedule，再创建新 schedule

### on_tag_arrange

Tag 整理任务的规则：

- 每新增 50 个 Event 触发一次
- 读取最近 50 个 Event，并把历史 tag 列表一并提供给 AI
- AI 可自动创建新 tag，无需用户确认
- 单次最多新增 3 个 tag
- 若 AI 产出的 tag 与现有 tag 命中去重规则，则跳过创建

### on_summary

Summary 触发与补算：

- 每个自然日结束时执行一次 summary 检查
- 当日期命中 `config.summary_intervals` 中任一周期时生成对应 Summary
- 若某次漏跑，则下次启动或下次调度时按 `last_summary_check` 回补
- 允许用户手动重生成 Summary

任务统计规则：

- 完成率公式：`finished / (finished + failed + rest)`
- 跨周期任务：未出结果前一直计入 `rest`，出结果后落入 `finished` 或 `failed`
- 无截止时间任务：未完成时也计入 `rest`

心情统计规则：

- mood 权重来自配置表 `config.mood_weights`
- 单个 Event 有多个 mood tag 时，分值相加
- 单个 Event 缺失 mood tag 时按 `0` 处理
- 日内曲线取“事件分值前缀和”
- 单日总心情值为当天所有事件 mood 分值总和
- 月度心情值为该月每日总心情值的平均值

Summary 输出规则：

- Summary 生成后写成一封 Mail
- Mail 的 `content` 统一为 HTML
- Summary 作为独立实体持久化，同时关联 `mail_id`
- Summary 模板允许执行内联脚本
- 心情图使用 `js + canvas` 绘制
- Mail 详情页使用 iframe / WebView 展示本地生成 HTML

### on_export_import

导出规则：

- Export Json 导出全部本地数据，采用 `schema_version = 1`
- 导出包包含：
  - `data`: AppState
  - `assets`: 所有媒体资源的 data URL 与元数据
  - `friend_memories`: Friend 记忆文件内容
  - `ui_preferences`: UI 偏好
- Export Diary 导出 Diary HTML
- Export Mails 导出 Mail HTML

导入规则：

- Import Json 兼容当前导出结构
- 导入行为为覆盖本地数据
- 导入前必须让用户确认覆盖
- 导入后需要恢复：
  - AppState
  - 媒体文件
  - Friend 记忆文件
  - UI 偏好

同步规则：

- `token` 保留给未来同步功能
- Demo 版不实现服务端 Push / Pull
