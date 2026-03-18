# UI

## UI Components

### Event Abstract

事件摘要展示内容包括：

- 事件标题
- 文本前 `config.abstract_show_content_length` 个字符
- 前 `config.abstract_show_picture_count` 张图片
- 按优先级取前 `config.abstract_show_tag_count` 个 tag
- 前 `config.abstract_show_comment_count` 条评论

展示顺序：

1. 标题与 tag 同行
2. 文本
3. 图片横向排列

Task 的卡片规则：

- 仅当前进行中的 Task 展示操作按钮
- 当前按钮为：`完成`、`放弃`
- 已完成或已失败的任务回到普通 Event 展示，不再显示操作按钮

### Event Flow

- 按 `time` 倒序展示 Event Abstract
- 左侧是一条竖直时间轴，右侧是卡片流
- 使用无限滚动，但只保留前后若干屏的动态加载内容
- 顶部筛选器包括：
  - 日期跳转控件
  - 关键词搜索
  - tags 过滤器
- tag 筛选逻辑取交集
- 日期控件用于跳转到某个日期附近的内容

### InputBox

用于创建普通 Event：

- 一个自动增高的文本框，初始高度较低，随内容增长
- 文本框下方是一行工具按钮：
  - 相机
  - 图片
  - 视频
  - 音频
  - 标签
  - 发送
- 本版移除“链接”按钮
- 点击标签时打开 `TagsWindow`
- 上传资源在工具栏下方竖直排列

滚动规则：

- 输入框、工具栏、资源预览共用一个滚动容器
- 当工具栏将从顶部离开屏幕时吸顶
- 当工具栏将从底部离开屏幕时吸底

### CameraButton

- 作为 `InputBox` 的快捷入口
- 拍摄一张图片或一段视频后，跳转到 New 页面
- New 页面自动带入刚拍摄的资源
- 用户确认后再发送，而不是拍完立即入库

### TagsWindow

`type: filter | create`

从上到下包括：

- 已选择标签区，横向排列，过多时换行
- 下方左右两栏：
  - 左侧为标签分类
  - 右侧为该分类下的标签列表

标签分类包括：

- nature
- mood
- others
- people
- location

create 模式：

- location 不切换到单独 tab，而是一个“携带当前位置”开关
- 默认开启

filter 模式：

- location 使用国家 / 省份 / 城市 / 区 的级联筛选
- 默认定位到当前位置；如果定位为空，则从空态开始选择

标签列表排序：

- 按最近一次使用时间倒序

### Detail

单个事件详情页从上到下包括：

- 事件区
  - 日期 + 标题
  - 标签
  - 正文
  - 多媒体资源
- 评论区
  - 评论默认按时间从新到旧
  - 提供“新到旧 / 旧到新”切换
  - 记住用户上一次排序选择

### Diary

- 这是一个“书页式”视图
- Demo 版仅考虑手机单栏布局
- 每个有 Event 的自然日生成若干页，再按时间顺序串成一本 Diary

单日内容顺序：

1. 日期标题
2. 当天所有事件（标题 + tags + raw + assets + comments）
3. 当天 summary

分页规则：

- 从上往下排版
- 若当前元素加入后高度超过“屏幕高度 - 2 × config.page_margin”，则分页
- 确定一页内容后，再重排该页，使空白更平均
- Demo 版 Diary 导出格式为 HTML

### Summary

- Summary 在自然日结束时检查生成
- 支持的周期为：`7d`、`3m`、`1y`
- 生成内容后，套入 HTML 模板
- 模板中包含：
  - 任务完成概览
  - 心情概览
  - AI 寄语
  - 用 `js + canvas` 绘制的心情图
- 每个 Summary 最终都作为一封 Mail 展示

## UI

- 顶部是一行工具栏
- 底部是一行导航栏
- 中间是切换页面区域

### 导航栏

#### New

#### Event Flow

#### Tasks

#### My

### Pages

#### Event Flow

- 放一个 Event Flow

#### New

- 放一个 InputBox

#### My

- 可点击列表：
  - Mailbox
  - Diary Page
  - Setting
  - Data

#### Tasks

- 基于 Event Flow，但不显示顶部筛选工具
- 只展示带有 `task + ongoing` tag 的任务
- 页面底部放一个文本框和一个发送按钮
- 文本框规则：
  - 第一行作为 `title`
  - 第二行及以后作为 `raw`
- 点击发送后：
  - 创建新 Task
  - 清空输入框
  - 新 Task 立即出现在任务流中

#### Mailbox

- 展示 Mail 列表
- 点击后进入 Mail Page

#### Mail Page

- 顶部标题栏显示 Mail 标题
- 下一行显示时间 + sender
- 剩余区域使用 WebView 展示 HTML 内容
- WebView 允许执行模板内脚本

#### Diary Page

- 展示 Diary

#### Data

按钮列表：

- Export Json
- Import Json
- Export Diary
- Export Mails

Demo 版说明：

- `Push` / `Pull` 暂不展示，避免出现空功能按钮

#### Setting

- `models`：列表；每项包含 `base_url`、`api_key`、`name`、`id`
- `friends`：列表；允许编辑全部字段
- `token`：保留给未来同步能力，先放在调试区即可
