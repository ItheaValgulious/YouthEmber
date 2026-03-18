# Behaviors

## 架构

- 本版 demo 只做移动端，所有数据本地保存
- 事件、任务、评论、summary 存在 SQLite，资源文件存在应用沙盒目录
- AI 请求由应用内后台队列调度，不依赖服务端
- AI 请求失败后进入重试队列，默认重试 3 次，间隔为 1 分钟、5 分钟、10 分钟
- 用户时区优先取 Setting 页面配置；未配置时取设备时区
- Push / Pull、服务端同步、Web 端能力都不在本版 demo 范围内

## AI 输出约定

全部采用json结构化输出

当 AI 参与事件/任务生成时，输出结构统一为：

- title: string，可为空
- tags: Tag 列表，可为空

当AI作为Friends进行评论时,输出内容为:

- attitude: float，范围 `[0, 1]`
- comment: string

当AI进行总结时,也按照文档内容生成对应字段.

规则：

- 用户已经填写的标题、正文、标签永远不被 AI 覆盖
- Event / Task 先落库，再异步补齐 AI 结果
- AI 失败不阻塞主流程，只会留下待重试任务

## Handler

### on_event_create

当创建一个 Event 时：

1. 立即保存 Event
2. 若 `title` 为空，则允许 AI 生成标题
3. AI 生成的标签与用户手填标签做并集，不覆盖用户输入
4. 为每个启用的 Friend 生成一个候选评论

Friend 评论规则：

- AI 必须返回 `attitude` 与 `comment`
- 是否回复概率：`clamp(active * (1 - attitude) * attitude, 0, 1)`
- 实际延迟分钟数：`round((latency + attitude * (1 - attitude)) * 60)`
- 随机种子不固定
- 同一 Event 不设硬性的回复数量上限

### on_task_create

创建 Task 时：

- Task 本质上也是 Event，但会自动加上 `task` 与 `ongoing` tag
- 如果来自 Tasks 页输入框：
  - 第一行作为 `title`
  - 剩余内容作为 `raw`
  - 如果只有一行，则该行作为 `title`，`raw` 为空
- 若 `time` 不为空，则创建对应的提醒 schedule
- 若 `time = null`，则不创建提醒
- AI 与 Friend 在读取上下文时应知道这是一个 Task

### on_task_complete

当用户完成 Task 时：

- 移除旧 schedule
- 移除 `ongoing` tag
- 添加 `finished` tag
- 保留 `task` tag 以记录其原本来自任务
- 将 `time` 更新为完成时间
- 触发 AI 评论
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
- 触发 AI 评论
- 失败后不能再改回完成

### on_task_timeup

提醒规则：

- `config.pre_alert` 是提前天数，类型为 int
- `config.alert_time` 是本地提醒时间，默认 `"09:00"`
- 若 `pre_alert = 0`，只在截止当天提醒一次
- 若 `pre_alert > 0`，则在“提前 `pre_alert` 天的 `alert_time`”提醒一次，并在截止当天再提醒一次
- 点击通知后进入该 Task 的 Detail 页面

超时规则：

- “当天结束”按用户本地时区的 `24:00` 计算
- 若到 `24:00` 时仍带有 `ongoing` tag，则触发 `on_task_fail`

任务变更规则：

- 修改 Task 时间时，先删除旧 schedule，再创建新 schedule

### on_tag_arrange

Tag 整理任务的规则：

- 每新增 50 个 Event 触发一次
- 读取最近 50 个 Event，并把历史 tag 列表一并提供给 AI
- AI 可自动创建新 tag，无需用户确认
- 为避免第一版 tag 爆炸，单次最多新增 3 个 tag
- 如果 AI 产出的 tag 与现有 tag 命中去重规则，则跳过创建

### on_summary

Summary 触发与补算：

- 每个自然日结束时执行一次 summary 检查
- 当日期命中 `config.summary_intervals` 中任一周期时生成对应 Summary
- 若某次漏跑，则下次启动或下次调度时补算
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
- 展示粒度支持：事件 / 天 / 月

Summary 输出规则：

- Summary 生成后写成一封 Mail
- Mail 的 `content` 统一为 HTML
- Summary 模板允许执行内联脚本
- 心情图使用 `js + canvas` 绘制
- WebView 允许执行脚本，但脚本来源仅限本地生成内容，不加载远程脚本资源

### on_export_import

导出规则：

- Export Json 导出全部本地数据，采用 `schema_version = 1`
- Export Diary 导出 Diary HTML
- Export Mails 导出 Mail HTML

导入规则：

- Import Json 要求与当前导出结构一致
- 导入行为为覆盖本地数据
- 导入前必须让用户确认覆盖

同步规则：

- `token` 保留给未来同步功能
- Demo 版不实现服务端 Push / Pull
- 未来同步规则固定为：
  - event / comment / task 按 id 去重后取并集
  - 不同 id 视为不同记录
  - task 状态优先级：`finished > not_finished > ongoing`
