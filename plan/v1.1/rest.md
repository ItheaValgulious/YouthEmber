# v1.1 本轮已实现内容

这份文件原本用于记录 `v1` 尚未实现 / 未完整实现的部分。  
本轮已经按顺序完成实现，并吸收了最新确认的改动。

## 已确认改动

- 上传入口保持现状，不再拆成独立的图片 / 视频 / 音频入口。
- 不再做单独的时区设置支持，直接使用当前运行环境时区；`Setting` 中的时区项已删除。
- Friend 回复概率公式改为 `active * attitude`。
- 当用户在详情页追加评论后，Friend 也会参与评论。

## 1. 任务提醒与超时链路

- 已补上 task 提醒的创建、取消、重建。
- 已接入 `Local Notifications` 插件；Web fallback 下也会按定时器调起浏览器通知。
- 已支持“提前 `pre_alert` 天 + 截止当天”的提醒链路。
- 已支持点击通知后进入对应 Task 的 Detail 页面。
- 已补上“到期当天本地 `24:00` 仍未完成则自动触发失败”的检查。
- 已补上任务详情页里的截止时间编辑入口，保存后会重建提醒。

## 2. Friend 回复规则

- 已按 `clamp(active * attitude, 0, 1)` 做是否回复的概率判定。
- 已保留延迟投递逻辑，让 Friend 回复仍然异步到达。
- 已在用户追加 Comment 后触发 Friend 评论。

## 3. Summary 数据与调度

- 已增加独立 `Summary` 实体并持久化。
- 已补上“自然日结束时检查”的定时调度。
- 已补上“只在命中周期时生成 Summary”的逻辑。
- 已补上漏跑补算；启动后会按 `last_summary_check` 回补。
- 已修正任务统计，跨周期 ongoing task 会正确计入 `rest`。
- 已补充心情的事件轨迹、日统计与月平均统计数据。

## 4. Event Flow 页面

- 已补上时间轴式展示。
- 已补上日期跳转控件。
- 已支持跳转到最接近目标日期的内容分组。
- 已补上按批次继续加载的动态加载体验。

## 5. New / InputBox / CameraButton

- 已把 New 页输入框改成自动增高。
- 已补上工具栏的吸附式展示。
- 已增加独立 `CameraButton` 快捷入口。
- 已支持“拍摄后跳到 New 页面，并自动带入资源，再由用户确认发布”。

## 6. Tags / Location

- 已把 `TagsWindow` 调整为双栏结构：左侧分类、右侧列表。
- `filter` 模式打开时会优先尝试用当前位置初始化 location 筛选。
- 已补上位置逆地理编码，写入 `country / province / city / district`。
- location 标签筛选现在可以按这些层级字段工作。

## 7. Diary 展示与导出排版

- 已补上书页式 Diary 预览。
- 已基于 `config.page_margin` 做近似分页。
- 已在单日 Diary 末尾插入当日命中的 Summary。
- Diary HTML 导出已同步到新的分页与 summary 结构。

## 8. 媒体元数据

- 已补上音频 / 视频的 `duration_ms`。
- 已补上视频缩略图 `thumbnail_path`。
- 已在 New / Detail 页面接入视频缩略图与时长展示。

## 9. Setting / Data 细项

- 已在 `Setting` 页面补上 `token` 预留字段，并纳入本地持久化 / 导入导出。
