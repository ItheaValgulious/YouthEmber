# UI

## UI Components

### Event Abstract

事件摘要展示内容包括：

- 事件标题
- 文本前 `config.abstract_show_content_length` 个字符
- 前 `config.abstract_show_picture_count` 张图片
- 按优先级取前 `config.abstract_show_tag_count` 个 tag
- 前 `config.abstract_show_comment_count` 条评论
- 非图片媒体以文件 chip 形式展示

展示顺序：

1. 标题与状态戳记
2. tag
3. 文本
4. 图片
5. 其他媒体
6. 评论摘要

Task 的卡片规则：

- 仅当前进行中的 Task 展示操作按钮
- 当前按钮为：`完成`、`放弃`
- 已完成或已失败的任务回到普通 Event 展示，不再显示操作按钮

### Event Flow

- 按 `time` 倒序展示 Event Abstract
- 以自然日分组
- 左侧是一条竖直时间轴，右侧是卡片流
- 顶部筛选器包括：
  - 日期跳转控件
  - 关键词搜索
  - tags 过滤器
- tag 筛选逻辑取交集
- 日期控件用于跳转到某个日期附近的内容
- 当前实现采用按批次增量加载，不是完整虚拟列表
- 页面右下角保留 `CameraButton` 快捷入口

### New

用于创建普通 Event：

- 自动增高文本框
- 顶部工具按钮包括：
  - 相机
  - 图片
  - 文件
  - 标签
  - 发布
- 点击标签时打开 `TagsWindow`
- create 模式下可额外携带当前位置
- 上传资源在正文下方预览
- 视频显示缩略图与时长
- 音频显示基础元信息
- 当前工具栏只做顶部吸附，不处理底部吸附

### CameraButton

- 作为 New 的快捷入口
- 当前实现支持直接拍照后跳转到 New 页面
- 拍完后不会立即入库，而是先带入 New 页面待用户确认
- 当前不支持直接拍摄视频

### TagsWindow

`mode: filter | create`

从上到下包括：

- 已选择标签区
- create 模式下的“携带当前位置”开关
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
- 当前实现支持这些层级字段筛选

### Detail

单个事件详情页从上到下包括：

- 事件区
  - 日期 + 标题
  - 标签
  - 正文
  - 多媒体资源
- ongoing task 额外显示任务控制区
  - 截止时间编辑
  - 完成
  - 放弃
- 评论区
  - 评论默认按时间从新到旧
  - 提供“新到旧 / 旧到新”切换
  - 记住用户上一次排序选择
  - 用户可追加评论

### Diary

- 这是一个“书页式”视图
- Demo 版仅考虑手机单栏阅读体验
- 当前实现为自定义布局引擎生成 `diary_book`
- 支持 `B5 / B6` 纸张与字体缩放
- 以一页一页翻看的方式预览
- Diary HTML 导出复用同一套布局结果

### Summary

- Summary 在自然日结束时检查生成
- 支持的周期为：`7d`、`3m`、`1y`
- 生成内容后套入 HTML 模板
- 模板中包含：
  - 任务完成概览
  - 心情概览
  - AI 寄语
  - 用 `js + canvas` 绘制的心情图
- 每个 Summary 最终都作为一封 Mail 展示

## UI

- 顶部是页面标题栏
- 底部是 Tab 导航栏
- 中间是页面内容区域

### 导航栏

#### Event Flow

#### New

#### Tasks

#### My

### Pages

#### Event Flow

- 放一个时间轴式 Event Flow

#### New

- 放一个创建 Event 的编辑页

#### Tasks

- 顶部是任务创建卡片
- 输入框全文直接作为任务正文
- 可选截止时间
- 下方展示 ongoing task 列表

#### My

- 以 panel 切换方式容纳：
  - Mailbox
  - Diary
  - Setting
  - Data

#### Mailbox

- 展示 Mail 列表
- 支持手动触发 `7d / 3m / 1y` Summary 生成

#### Mail Page

- 顶部标题栏显示 Mail 标题
- 下一行显示时间 + sender
- 剩余区域使用 iframe / WebView 展示 HTML 内容
- 允许执行模板内脚本

#### Diary Page

- 展示 DiaryBookView

#### Data

按钮列表：

- Export Json
- Import Json
- Export Diary
- Export Mails

#### Setting

当前更偏运行控制台，包含：

- runtime / platform / storage 信息
- pre_alert / alert_time / token
- language / paper theme / diary paper / diary font scale
- models 列表
- friends 列表

用户友好型重构留到下一步。
