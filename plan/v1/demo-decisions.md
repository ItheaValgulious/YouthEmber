# Demo 版我补充拍板的内容

下面这些内容不是 PM 明确写死的，而是为了让 demo 能落地，我在合并文档时补上的实现约定。

## 范围与平台

- 本版 demo 改为只做移动端，Web 端整体后移
- `Push / Pull` 不在本版实现，也不在 Data 页面展示

## 数据结构

- 给 `Event` 补了 `created_at`，避免 Task 完成后丢失创建时间语义
- 给 `Asset` 补了可选元数据：`mime_type`、`size_bytes`、`width`、`height`、`duration_ms`、`thumbnail_path`
- 给 `Comment` 补了 `id` 和可选 `attitude`
- 给 `Friend` 补了 `id`、`name`、`enabled`
- 给 `Mail` 补了 `id`
- 把 location 明确为独立结构体：国家 / 省 / 市 / 区 / 经纬度

## Task 状态

- 明确系统标签由 `todo` 更名为 `task`
- 明确当前任务筛选规则为 `task + ongoing`
- 明确完成态为 `task + finished`
- 明确失败态为 `task + not_finished`
- 给任务流补了“放弃”按钮，否则用户无法触发失败

## 默认配置

- 补了 `config.alert_time = "09:00"`
- 补了 `config.page_margin = 24`
- 给 mood 先补了一组 demo 默认权重，后续可再调

## 行为与算法

- 规定 AI 请求失败后按 `1 分钟 / 5 分钟 / 10 分钟` 重试 3 次
- 规定用户时区未配置时，回退到设备时区
- 给 Tag 增加了基于 `type + label` 的去重规则
- 给 `on_tag_arrange` 增加“单次最多新增 3 个 tag”，避免第一版失控

## UI 与展示

- 移除了 InputBox 的“链接”按钮
- CameraButton 改为“拍摄后跳回 New 页确认”，而不是直接入库
- Event Flow 明确按 `time` 倒序展示
- Diary 先只做手机单栏
- Summary 邮件改为 HTML + 内联脚本 + Canvas 图表
- 当前版本重点放在完整程序框架功能和 AI prompt 设计
- Summary 的视觉细节后续交给专门前端迭代

## 安全与兼容

- Mail WebView 允许执行本地模板内脚本，不加载远程脚本资源
- 敏感信息仍按 demo 需求保留在 Setting 里，但同步能力本身先不落地
- 未来同步规则按当前文档固定，不再另起一套
- 当前 demo 可沿用安装时申请权限；正式版改为按需申请
