# Behaviors

## 架构

有一个后台任务程序,调度AI请求.

## Handler:

### onEventCreate

当创建一个event时,调用AI进行comment

消息概括:
用一个AI读取事件内容,生成:
- title(若没有)
- Tags(用ai生成的标签并上用户自己添加的标签作为最终标签集合)

调用每个Friend生成一个comment,其中ai应该返回的内容包括:
- attitude 态度(这个朋友有多大可能喜欢你的内容)
- 评价:string 朋友的回复

关于active,lagency,attitude的多元函数会计算出最终是否回复以及lagency

### onTaskCreate

创建一个task时:
- schedule一个task的time时触发的onTaskTimeup
其余和onEventCreate相同,但Friend Comment的时候应该读到这是一个task

### onTaskCompelete

移除timeup的schedule.

### onTaskTimeup(发生在用户任务timeup当天和前config.pre_al)

使用通知提醒用户

若当天结束时仍未完成,把任务转为Event并onTaskFail

### onTaskFail

添加not finished tag

触发AI评论

### onTaskFinish

添加finished tag

触发AI评论

### onTagArrange

定期发生,令AI阅读一段时间内的所有Event并决定是否要添加一个新tag

### onSummary

总结内容包括:

任务完成度: 完成任务列表,剩余任务列表,完成比率,关于任务完成的AI分析+寄语

心情: 给mood类tag不同的权值,并用于代表一件事的心情值,计算一天的心情值,以时间为横轴,心情值为纵轴,画出心情曲线图,显示时应能区分时间轴时事件/天/约,关于心情的AI分析+寄语

关于你的生活的AI寄语.

### onExport/Import

导出/导入全部用户数据
