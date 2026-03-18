# AI Dairy App

## Meta:

platform: phone mainly. web also.
style: pencil draw

## Defs

### Event:

struct Event: 用户分享的一次事件
- assets: 包含的多媒体资源,包含视频,音频,图片
- comments: AI评论内容
- tags: 是一个标签的集合
- raw: string 用户的原始配文
- title: 事件标题
- time: 日期和时间

### Task

一类特殊的event,time为未来的某个时间(或null表示无期限)

根据时间来区分这类event对象

会带有todo tag

### Tags

分为几类:
- nature:这件事的性质,如life,work,academy,discovery,trifle...
- mood:此时的心情,如happy,upset,hesitant,surprise,moved...
- others: 其他类型tag
- people: 包含的人
- location: 当前地点

struct Tag:
- type: nature/mood/...
- rules: string 描述什么样的内容适用这个tag

### Comments

- content: string,要支持emoji
- sender: 发送者
- time: 日期和时间

### Friends:

某个AI扮演的分身

- model_id: string
- soul: ai的性格描述
- system_prompt:string
- parameters
- active: 该friend comment用户的可能性
- lagency: 该friend comment用户的平均延迟

### Summary

- date_range:tuple<date,date> 是针对这段时间的summary
- tasks
  - finished:list 已经完成的任务
  - failed:list 失败了的任务
  - rest:list 剩余未完成的任务
  - rate 完成率
  - summary AI关于任务的分析和寄语
- mood
  - track:list<tuple<time,float> time是Event的time,float是心情值
  - summary:AI关于心情的分析和寄语
- summary:AI总的寄语


### Mail

- time
- title
- sender
- content
