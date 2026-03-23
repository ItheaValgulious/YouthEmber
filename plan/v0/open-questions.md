# Open Questions 处理结论

这份文件记录上一轮 open questions 的最终结论。当前这 5 项都已确认，不再视为阻塞问题。

## 1. Friend 回复公式

- 公式保持不变：`active * (1 - attitude) * attitude`
- 当前版本不再继续讨论其语义，按既定公式实现

## 2. 任务系统标签

- 原系统标签 `todo` 全面更名为 `task`
- 对应状态组合更新为：
  - 进行中：`task + ongoing`
  - 已完成：`task + finished`
  - 已失败：`task + not_finished`

## 3. Summary 视觉标准

- 当前版本重点放在完整程序框架功能和 AI prompt 设计
- Summary 的视觉样式、细节动效、排版精修后续交由专门前端处理
- 当前文档只保留结构、渲染方式和功能要求

## 4. 未来同步规则

- 未来同步规则按当前文档确定，不再重新设计
- 固定规则为：
  - event / comment / task 取并集
  - 按 id 去重
  - task 状态优先级：`finished > not_finished > ongoing`

## 5. 权限申请时机

- 当前 demo 可沿用安装时申请权限
- 正式版会调整为按需触发申请
