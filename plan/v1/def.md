# AI Diary App

## Meta

- platform: mobile demo only (iOS / Android)
- web: 暂不纳入本版 demo
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
- config.mood_weights:
  - happy: 2.0
  - moved: 1.5
  - surprise: 0.5
  - hesitant: -0.5
  - upset: -2.0

## Defs

### Event

struct Event: 用户分享的一次事件

- id: string
- created_at: 创建时间
- time: 事件时间；普通 Event 默认为创建时间，Task 完成/失败后更新为结果发生时间
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

### Tags

Tag 分为几类：

- nature: 事件性质，如 `life`、`work`、`academy`、`discovery`、`trifle`
- mood: 心情，如 `happy`、`upset`、`hesitant`、`surprise`、`moved`
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
- filepath: 存储在资源文件夹下的路径
- type: `image` / `video` / `audio`
- upload_order: number
- mime_type: string，可选；例如 `image/jpeg`、`video/mp4`、`audio/mpeg`，用于渲染、导出和系统分享时识别真实媒体类型
- size_bytes: number，可选
- width: number，可选
- height: number，可选
- duration_ms: number，可选
- thumbnail_path: string，可选

规则：

- 资源排序按上传顺序
- 上传失败时弹出错误提示框
- Demo 版不限制图片、视频、音频大小；后续如果性能不达标再加限制

### Comment

struct Comment:

- id: string
- content: string，支持 emoji
- sender: `user` 或某个 `friend_id`
- time: 日期和时间
- attitude: float，可选；仅 Friend 生成评论时存在，范围 `[0, 1]`

规则：

- 用户不能编辑或删除 Comment
- 用户追加评论时，创建新的 Comment，不复用旧 Comment
- 默认按时间排序；具体默认顺序由 UI 决定

### Friend

某个 AI 扮演的分身

- id: string
- name: string
- model_id: string
- soul: AI 的性格描述
- system_prompt: string
- active: 回复概率系数，范围 `[0, 1]`
- latency: 延迟系数，范围 `[0, 1]`
- enabled: bool

规则：

- Friend 可在 Setting 页面创建、编辑、删除、启用、禁用
- `active` 与 `latency` 都是无单位系数，具体换算规则见 `behavior.md`

### Summary

- date_range: `tuple<date, date>`，针对某个时间段的 summary
- interval: `7d` / `3m` / `1y`
- tasks
  - finished: list，已完成任务
  - failed: list，失败任务
  - rest: list，剩余未完成任务
  - rate: 完成率，公式为 `finished / (finished + failed + rest)`
  - summary: AI 关于任务的分析和寄语
- mood
  - track: `list<tuple<time,float>>`
  - daily_total: float
  - summary: AI 关于心情的分析和寄语
- summary: AI 总寄语

### Mail

- id: string
- time: 日期和时间
- title: string
- sender: string
- content: string
