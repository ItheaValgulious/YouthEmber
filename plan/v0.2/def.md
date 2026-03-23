# AI Diary App v0.2

## Meta

- platform: mobile demo first (iOS / Android)
- web: 保留 Web fallback，用于浏览器预览、导入导出与部分能力降级
- style: pencil draw

## Naming

- 持久化字段名、配置项、事件名统一使用英文小写加下划线
- 类名、页面名、组件名使用 PascalCase
- 文档统一使用 `Diary`、`CameraButton`、`latency`、`Ionic`

## Config

- config.pre_alert: 2
- config.alert_time: `"09:00"`
- config.abstract_show_content_length: 500
- config.abstract_show_picture_count: 4
- config.abstract_show_tag_count: 5
- config.abstract_show_comment_count: 5
- config.summary_intervals: `["7d", "3m", "1y"]`
- config.page_margin: 24
- config.diary_paper_size: `B5 | B6`，默认 `B5`
- config.diary_font_scale: `1.0`
- config.mood_weights:
  - happy: 2.0
  - moved: 1.5
  - surprise: 2.0
  - achievement: 2.0
  - hesitant: -1.0
  - upset: -2.0
  - boring: -1.0
  - lonely: -2.0

## Defs

### Event

struct Event: 用户分享的一次事件

- id: string
- created_at: 创建时间
- time: 事件时间；普通 Event 默认为创建时间，Task 完成/失败后更新为结果发生时间；ongoing task 可用作截止时间
- title: string，可为空；为空时允许 AI 生成
- raw: string，可为空
- tags: Tag 的集合；最终集合为“用户手填标签 ∪ AI 标签”
- assets: Asset 列表，可为空
- comments: Comment 列表，可为空

说明：

- Event 创建后立即落库，AI 生成标题、标签、评论允许异步补全。
- Demo 版不支持用户直接编辑或删除 Event；用户只允许追加 Comment。

### Task

Task 不单独建 type 字段，而是 Event 的一种系统状态组合。

- 当前进行中的 Task：带有 `task` 与 `ongoing` tag
- 已完成的 Task：带有 `task` 与 `finished` tag
- 已放弃或超时失败的 Task：带有 `task` 与 `not_finished` tag
- Task 的判定规则：
  - `time = null`：无截止时间任务
  - 任务记录必须带有 `task` tag
  - 当前未完成任务额外带有 `ongoing` tag
- `time = null` 的 Task 不参与提醒，按“未完成任务”展示
- 任意 Task 完成或失败时，都把 `time` 更新为结果发生时间

当前 Tasks 创建入口约定：

- 输入框全文直接写入 `raw`
- `title` 初始允许为空，由 AI 后补
- 不再按“第一行 title / 其余 raw”拆分

### Tags

Tag 分为几类：

- nature: 事件性质，如 `life`、`work`、`academy`、`discovery`、`trifle`
- mood: 心情，如 `happy`、`moved`、`surprise`、`achievement`、`hesitant`、`upset`、`boring`、`lonely`
- others: 其他类型 tag
- people: 相关人物
- location: 地点

系统保留 tag：

- `task`
- `ongoing`
- `finished`
- `not_finished`

struct Tag:

- id: string
- label: string
- type: `nature` / `mood` / `others` / `people` / `location`
- rules: string，描述什么内容适用该 tag
- payload: 仅 `location` 类型使用，对应一个 Location 结构
- system: bool，可选；系统保留 tag 标记
- last_used_at: string | null，可选；用于排序

Tag 规则补充：

- 摘要展示优先级：`mood > others > people > nature > location`
- 同优先级时按最近使用时间倒序
- 去重规则：同 `type + label` 视为同一个 tag，比较时忽略大小写并去首尾空格
- 系统保留 tag 不允许用户手动修改

### Location

struct Location:

- country: string | null
- province: string | null
- city: string | null
- district: string | null
- latitude: float | null
- longitude: float | null

### Asset

struct Asset:

- id: string
- filepath: 存储在资源目录下的相对路径
- filename: string，可选
- type: `image` / `video` / `audio`
- upload_order: number
- mime_type: string，可选
- size_bytes: number，可选
- width: number，可选
- height: number，可选
- duration_ms: number，可选
- thumbnail_path: string，可选

运行时补充字段：

- `uri`: 原生文件系统返回的 uri，可选
- `display_path`: 供 WebView / 浏览器直接展示的路径，可选

规则：

- 资源排序按上传顺序
- 上传失败时弹出错误提示框
- Demo 版不限制图片、视频、音频大小；后续如性能不达标再加限制

### Comment

struct Comment:

- id: string
- content: string，支持 emoji
- sender: `user` 或某个 `friend_id`
- time: 日期和时间
- attitude: float，可选；仅 Friend 生成评论时存在，范围通常为 `[0, 1]`
- reply_to_comment_id: string，可选；表示该评论回复的上一条评论

规则：

- 用户不能编辑或删除 Comment
- 用户追加评论时，创建新的 Comment，不复用旧 Comment
- 默认按时间排序；具体默认顺序由 UI 决定

### Model

struct Model:

- id: string
- name: string
- base_url: string
- api_key: string
- img_dealing: bool；是否支持直接图片输入

### Friend

某个 AI 扮演的分身

- id: string
- name: string
- model_id: string
- memory_path: string；Friend 记忆文件路径
- soul: AI 的性格描述
- system_prompt: string
- active: 回复权重系数；当前实现允许大于 `1`
- ai_active: 继续参与 AI 对话链的额外权重系数
- latency: 延迟系数
- enabled: bool

规则：

- Friend 可在 Setting 页面创建、编辑、删除、启用、禁用
- `active`、`ai_active` 与 `latency` 都是无单位系数，具体换算规则见 `behavior.md`

### Summary

Summary 为独立实体，并会同步产出一封 Mail。

- id: string
- created_at: string
- interval: `7d` / `3m` / `1y`
- range_start: string
- range_end: string
- title: string
- mail_id: string
- tasks:
  - finished: number
  - failed: number
  - rest: number
  - rate: number
  - summary: string
- mood:
  - event_track: `list<{ time, value }>`
  - daily_totals: `list<{ date, total }>`
  - monthly_averages: `list<{ month, average }>`
  - total: number
  - summary: string
- summary: AI 总寄语

### Mail

- id: string
- time: 日期和时间
- title: string
- sender: string
- content: string，HTML
- summary_meta: 可选；Summary 关联信息
