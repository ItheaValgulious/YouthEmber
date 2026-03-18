# AI Dairy V1 待 PM 补充清单

说明：
- 这份文档不改原始需求，只把当前 `plan\v1` 里未明确、会影响开发实现的点摘出来。
- 每条都保留了原文片段，方便直接对照。
- 请 PM 直接在 `【PM填写】` 后补充，尽量给出明确规则、边界、默认值。

---

## 1. 后台任务程序归属不清

**出处**：`behavior.md`

**原文**
> 有一个后台任务程序,调度AI请求.

**问题**
- 没写这个“后台任务程序”运行在哪里：本地、移动端后台、服务端、还是云函数。
- 没写 Web 端是否也支持这套后台逻辑。

**【PM填写】**
- 后台任务运行位置： 移动端
- iOS/Android 是否一致：是
- Web 是否支持：是
- 如果不支持，降级方案：无

---

## 2. Event 与 Task 的边界不清

**出处**：`def.md`

**原文**
> 一类特殊的event,time为未来的某个时间(或null表示无期限)
>
> 根据时间来区分这类event对象
>
> 会带有todo tag

**问题**
- Task 是靠“未来时间”区分，还是靠类型字段区分，原文前后都像在猜。
- `time = null` 时为什么还是 Task，没有截止时间的任务如何排序、提醒、失败。
- 只靠 `todo tag` 区分会和普通 Event 的 tag 体系打架。

**【PM填写】**
- Task 的唯一判定规则：根据time是否为null或大于当前时间
- 是否需要单独 `type` 字段：无
- `time = null` 时的展示规则：按照未完成展示,当完成时time设为完成时间
- `time = null` 时的提醒规则：无提醒
- `time = null` 时的失败规则：用户主动使任务失败
- 补充:任何任务完成时都把其time设为完成时间

---

## 3. Event 数据结构缺字段

**出处**：`def.md`

**原文**
> struct Event: 用户分享的一次事件
> - assets: 包含的多媒体资源,包含视频,音频,图片
> - comments: AI评论内容
> - tags: 是一个标签的集合
> - raw: string 用户的原始配文
> - title: 事件标题
> - time: 日期和时间

**问题**
- 没写主键、创建时间、更新时间、删除状态、来源、排序字段。
- `assets` 只有大类，没有结构。
- `comments` 只写“AI评论内容”，但后面又出现 `sender`，说明评论不一定只有 AI。

**【PM填写】**
- Event 字段：全部time为自动生成,raw,title,tags,comments可能为空/不为空,若为空则为ai生成,assets可能为空
- 是否需要 `id`：是
- 是否支持编辑/删除：无用户主动编辑,只有用户comment/Friend comment
- 是否保留创建时间、更新时间：所以只有创建一次的时间是time,没有更新,只有comment的时间记录在comment里

---

## 4. Asset 结构未定义

**出处**：`def.md`

**原文**
> - assets: 包含的多媒体资源,包含视频,音频,图片

**问题**
- 没写每个资源至少有什么字段：类型、地址、缩略图、文件大小、时长、宽高、排序。
- 没写上传限制和失败处理。

**【PM填写】**
- Asset 字段列表：
  - id
  - filepath:存储在资源文件夹下的路径
  - type:文件类型
- 图片大小限制：无
- 视频大小/时长限制：无
- 音频大小/时长限制：无
- 排序规则：上传顺序
- 上传失败的交互：弹出错误提示框

---

## 5. Comment 与 sender 规则不清

**出处**：`def.md`、`behavior.md`

**原文**
> - comments: AI评论内容
>
> - sender: 发送者
>
> 调用每个Friend生成一个comment

**问题**
- 文档一处写评论是 AI 评论，一处又抽象成通用 sender。
- 没写 sender 的取值范围：系统、Friend、用户，还是别的对象。
- 没写评论是否允许用户回复、编辑、删除。

**【PM填写】**
- sender 的合法类型： 某个friend或user
- 评论是否只有 AI 可发：否
- 用户能否回复评论：用户只发新评论
- 评论能否编辑/删除：否
- 评论展示顺序默认值：时间

---

## 6. Friend 配置结构不完整

**出处**：`def.md`

**原文**
> 某个AI扮演的分身
>
> - model_id: string
> - soul: ai的性格描述
> - system_prompt:string
> - parameters
> - active: 该friend comment用户的可能性
> - lagency: 该friend comment用户的平均延迟

**问题**
- `parameters` 没结构定义。
- `active`、`lagency` 没单位、范围、默认值。
- 也没说明 Friend 是否可以被用户增删改、启停。

**【PM填写】**
- `parameters` 的结构：删除这个字段
- `active` 的类型/范围/默认值：系数,无单位
- `lagency` 的单位/范围/默认值：系数,无单位
- 最终设置回复概率为active*(1-attitude)*attitude,延迟为lagency+attitude*(1-attitude)
- Friend 是否允许用户创建/编辑/删除：是,在setting页面
- Friend 是否允许启用/禁用：是

---

## 7. Friend 回复判定公式未定义

**出处**：`behavior.md`

**原文**
> 关于active,lagency,attitude的多元函数会计算出最终是否回复以及lagency

**问题**
- 这里是整个 AI 评论触发的核心规则，但没有公式。
- 没写是否随机、是否可复现、是否需要冷却时间。
- 没写 attitude 和回复内容之间的关系。

**【PM填写】**
- 是否回复的计算规则：见上文
- 最终延迟的计算规则：见上文
- 是否带随机性：是
- 随机种子是否要固定：不固定
- 是否存在同一事件最多回复数：不存在

---

## 8. onEventCreate 的 AI 生成边界不清

**出处**：`behavior.md`

**原文**
> 用一个AI读取事件内容,生成:
> - title(若没有)
> - Tags(用ai生成的标签并上用户自己添加的标签作为最终标签集合)

**问题**
- 没写 title 为空的判定规则。
- 没写 AI 生成标签时能否覆盖用户标签。
- 没写 AI 生成失败时怎么处理。

**【PM填写】**
- “若没有 title”的判定规则： 用户没写
- 用户手填标签是否永远保留：是
- AI 标签是否允许覆盖已有标签：否
- AI 失败时是否允许事件先落库：是
- AI 重试策略：把AI某个事件的生成任务失败这件事存储到队列

---

## 9. onTaskCreate / onTaskComplete 状态流不清

**出处**：`behavior.md`

**原文**
> 创建一个task时:
> - schedule一个task的time时触发的onTaskTimeup
> 其余和onEventCreate相同,但Friend Comment的时候应该读到这是一个task
>
> 移除timeup的schedule.

**问题**
- 没写任务修改时间后的重排逻辑。
- 没写完成后是否还能重新打开。
- 没写完成和失败是否互斥、能否反悔。

**【PM填写】**
- 修改 task 时间后如何处理 schedule：当然是删除schedule后用新的
- Task 完成后能否改回未完成：不能
- Task 失败后能否再完成：不能
- Task 完成时是否保留在 Tasks 页：不保留,变为事件
- PS:失败是用户自己点的,表示他放弃了这个任务

---

## 10. onTaskTimeup 规则不完整

**出处**：`behavior.md`

**原文**
> onTaskTimeup(发生在用户任务timeup当天和前config.pre_al)
>
> 使用通知提醒用户
>
> 若当天结束时仍未完成,把任务转为Event并onTaskFail

**问题**
- `config.pre_al` 未定义。
- “当天结束”按哪个时区、几点算结束没写。
- 没写通知提醒几次、通知文案、点开后跳哪里。

**【PM填写】**
- config.pre_alert为int提前的天数
- 通知提前多久:在当天config.alert_time提醒
- 通知次数：1 或 2,若pre_alert为0则只在当天通知
- 用户时区来源：用户在setting页面设置/地理位置
- “当天结束”的精确定义：24:00
- 通知点击后的跳转页面：Task的Event Detail

---

## 11. Task 失败/完成后的 tag 规则不清

**出处**：`behavior.md`

**原文**
> 添加not finished tag
>
> 添加finished tag

**问题**
- 没写这两个 tag 是否系统保留、用户能否删改。
- 没写与 `todo tag` 的关系，是替换还是并存。

**【PM填写】**
- `todo` / `finished` / `not finished` 的状态关系： todo是标注这是一个task的,只要是task就有,not finished当用户未完成任务时添加,finished当完成时添加
- 失败后是否移除 `todo`：否
- 完成后是否移除 `todo`：否
- 用户能否手动修改这些系统标签：否

---

## 12. onTagArrange 的策略为空

**出处**：`behavior.md`

**原文**
> 定期发生,令AI阅读一段时间内的所有Event并决定是否要添加一个新tag

**问题**
- 没写触发周期、时间窗口、是否自动落库、是否需要用户确认。
- 没写“新 tag”创建规则和去重规则。

**【PM填写】**
- 触发周期：每增加50个事件
- 一次分析的时间窗口：近50个事件,且AI能读到全部老tag
- 新 tag 是否自动创建：是
- 是否需要用户确认后生效：否
- tag 去重规则：无去重,因为ai能读到老tag,要求ai不创建重复tag

---

## 13. Summary 计算口径不清

**出处**：`behavior.md`、`def.md`

**原文**
> 任务完成度: 完成任务列表,剩余任务列表,完成比率,关于任务完成的AI分析+寄语
>
> - tasks
>   - finished:list 已经完成的任务
>   - failed:list 失败了的任务
>   - rest:list 剩余未完成的任务
>   - rate 完成率

**问题**
- 没写完成率分母怎么算：只算到期任务、所有任务、还是时间窗口内创建过的任务。
- 没写跨周期任务如何统计。

**【PM填写】**
- 完成率分母定义：finished/finished+failed+rest
- 跨周期任务归属规则：在前面每次都作为rest,当出现结果时称为finished/failed
- 无截止时间任务是否计入：未完成的时候计入rest
- 失败任务是否计入完成率：看公式

---

## 14. mood 权重和曲线算法未定义

**出处**：`behavior.md`、`def.md`

**原文**
> 心情: 给mood类tag不同的权值,并用于代表一件事的心情值,计算一天的心情值,以时间为横轴,心情值为纵轴,画出心情曲线图
>
> - mood
>   - track:list<tuple<time,float> time是Event的time,float是心情值

**问题**
- 每个 mood 的权重表没给。
- 一个事件多个 mood tag 时怎么算。
- 一天的心情值是平均、累积、插值还是别的算法没写。

**【PM填写】**
- 每个 mood tag 的权重表：先写程序,作为配置文件
- 单事件多个 mood 的合成规则：相加
- 一天的心情值是计算每个事件的前缀和,而总和是这一天的心情值,月心情值是天的平均值
- 缺失 mood 标签时如何处理：记录0,但不应该缺失,因为是AI生成的
- 曲线展示粒度（事件/小时/天）：提供事件/天/月 三粒度的切换

---

## 15. 配置项只被引用，没有定义

**出处**：`behavior.md`、`look.md`

**原文**
> config.pre_al
>
> config.abstract_show_content_length
>
> config.abstract_show_picture_count
>
> config.abstract_show_tag_count
>
> config.abstract_show_comment_count
>
> config.summary_intervals{}

**问题**
- 文档里直接引用了多个 config，但没有总表、默认值、类型、配置入口。

**【PM填写】**
- 配置项总表：
- 每个配置项的类型：
- 每个配置项的默认值：
- config.pre_alert: 2
-
- config.abstract_show_content_length: 500
-
- config.abstract_show_picture_count: 4
-
- config.abstract_show_tag_count: 5
-
- config.abstract_show_comment_count: 5
-
- config.summary_intervals{7d,3m,1y}
- 是否允许用户在 Setting 修改：是

---

## 16. Tag 分类与 UI 分类不一致

**出处**：`def.md`、`look.md`

**原文**
> - people: 包含的人
> - location: 当前地点
>
> 标签分类(nature/mood/others/location)

**问题**
- 数据定义里有 `people`，UI 分类里没有。
- 不确定 `people` 是漏了，还是被并进 `others`。

**【PM填写】**
- `people` 是否为正式 tag 分类：是
- 如果是，UI 放在哪里：新加一类

---

## 17. location 的数据结构与筛选方式冲突

**出处**：`def.md`、`look.md`

**原文**
> - location: 当前地点
>
> type为create时location只是一个按钮用于选择是否携带当前位置,不切换选项卡,默认为开启
>
> type为filter的时候location选项卡里的选法不是标签的集合,而是国家,省份,城市,区的级联选择.默认为当前位置.

**问题**
- 创建时像一个“当前定位开关”，筛选时又像标准化地址层级。
- 没写保存的是坐标、文本、行政区编码，还是 tag。

**【PM填写】**
- location 的存储格式：结构体,包括国家,省份,城市,区,经纬度共6个字段
- 是否保存经纬度：是
- 是否保存行政区编码：否
- 创建时默认是否开启定位：是
- 无定位权限时的处理：null

---

## 18. Tag 优先级未定义

**出处**：`look.md`

**原文**
> tag的优先级最高的前config.abstract_show_tag_count个

**问题**
- 没有任何地方定义 tag priority。
- 不知道是按类型优先、系统优先、最近使用优先，还是用户手选优先。

**【PM填写】**
- tag 优先级规则：按类型排序:类型为mood>others>people>nature>location
- 同优先级时的排序规则：无所谓
- 是否允许用户调整优先级：否

---

## 19. Event Flow 的筛选能力不完整

**出处**：`look.md`

**原文**
> 组件最上方时筛选器:一个日期控件,以及tags,展示当前显示的tags

**问题**
- 日期筛选是单日、区间、月份还是无限范围没写。
- tags 是“包含任一”还是“必须同时包含”没写。

**【PM填写】**
- 日期筛选类型：是跳转到某个日期,这是一个无限滚动容器.不过是动态加载的,只加载前后若干(所以也无滚动条)
- tags 的筛选逻辑：选取tags的交集
- 是否支持关键词搜索：是
- 是否支持只看有图片/视频/评论：否

---

## 20. InputBox 里的“链接”没有数据落点

**出处**：`look.md`、`def.md`

**原文**
> 第一行横排若干个按钮成一行:相机,图片,视频,音频,链接,标签,发送,

**问题**
- 数据模型里没有 link 字段，也没有说明链接属于 raw 还是 assets。
- 没写链接预览是否需要抓取标题、描述、封面。

**【PM填写】**
- link 的存储位置：删除link吧

---

## 21. “按钮吸顶/吸底”交互描述不够精确

**出处**：`look.md`

**原文**
> 当上传资源过多/文字过多时,滚动条整体滚动三部分,但按钮一行会在到达屏幕顶部后保持在顶部/到达屏幕底部后保持在底部

**问题**
- 这句难以直接实现，吸顶和吸底的触发条件、页面层级、滚动容器都没写。

**【PM填写】**
- 具体滚动容器：输入框+工具栏+资源展示一起滚动
- 按钮栏何时吸顶：当按纽栏将从上方退出屏幕
- 按钮栏何时吸底：当按纽兰将从下方退出屏幕

---

## PS

经过开会,放弃Web端

---

## 22. CameraButton 产出的默认值未定义

**出处**：`look.md`

**原文**
> InputBox的捷径,使用摄像机上传一张图像/视频,其他值全部默认

**问题**
- “其他值全部默认”没有默认规则。
- 不知道 title、time、tag、location、comment 是否自动生成。

**【PM填写】**
- 经过考虑,上传一张图片/视频后跳转到inputbox页面,上传拍摄的那一张资源

---

## 23. Detail 页评论排序默认值不清

**出处**：`look.md`

**原文**
> 按日期排序,一个切换从新到旧/从旧到新的按钮

**问题**
- 没写默认顺序。
- 没写这个排序偏好是否记忆。

**【PM填写】**
- 默认排序：新到旧
- 是否记住用户上次选择：是

---

## 24. Dairy 生成规则不完整

**出处**：`look.md`

**原文**
> 每一个有Event的Day生成若干页,再把所有页按顺序放到一起形成一本书.
>
> 对于一天,先有一个标题+日期,然后是依次排列每件事(标题+tags+raw+assets+comments),最后是这一天的summary

**问题**
- 没写分页规则、溢出规则、导出格式、打印样式。
- 没写“没有 summary 的天”怎么处理。

**【PM填写】**
- 分页规则：当这页放不下了.第一版先生成的时候从上往下写
- 单页最大内容限制：可以计算元素可视高度的,若加入当前条后可视高度超过用户手机高度-2*config.page_margin(px)则分页,确定了内容,然后重新排版本页使得高度间隔相等
- 没有 summary 的天是否展示：每天都有,不会没有
- 导出格式（HTML/PDF/图片）：HTML

---

## 25. Summary 触发规则不完整

**出处**：`look.md`

**原文**
> 每间隔若干时间生成一个 Summary.间隔时间为config.summary_intervals{}中的某一项就生成一次总结.每一项为一个字符串,单位包括("d","m","y")

**问题**
- 没写什么时候触发：自然日结束、应用启动时补算、后台定时跑。
- 没写多个 interval 会不会重复生成。

**【PM填写】**
- Summary 触发时机：自然日结束
- 多个 interval 的并存规则：触发多次
- 漏跑后的补算规则：补算
- 是否允许手动重生成：是

---

## 26. Summary HTML 模板来源不清

**出处**：`look.md`

**原文**
> 确定了Summary内容后,根据一个模板生成一个html字符串.
>
> 每个总结是一个Mail,content为html字符串

**问题**
- 模板来源、样式规范、是否支持暗色模式都没写。
- HTML 中图表如何生成、是否允许脚本也没写。

**【PM填写】**
- HTML 模板来源：你写啊,可以先写个demo,这个页面要之后迭代
- 是否支持暗色模式：之后迭代
- 图表生成方式：之后迭代
- Mail 中是否允许脚本：允许
- WebView 安全要求：没有不安全的代码,因为都是你/AI生成的

---

## 27. Tasks 页底部输入框用途不明

**出处**：`look.md`

**原文**
> 一个Event Flow,但不显示筛选工具,但强制只显示所有task
>
> 页面下方一个文本框和一个发送按钮

**问题**
- 这组输入控件没有说明用途：新建任务、搜索任务、还是给 AI 发指令。

**【PM填写】**
- 文本框用途：新建任务,第一行当title,后面的当raw
- 发送按钮行为：新建一个Task
- 输入成功后的页面反馈：清空文本框,创建新Task,Task应该会显示到那个Event Flow里

---

## 28. Data 页同步能力未定义

**出处**：`look.md`

**原文**
> Export Json
> Import Json
> Export Dairy
> Export Mails
>
> Push
> Pull

**问题**
- 导出格式、导入校验、覆盖规则都没写。
- `Push/Pull` 没写同步目标、账号、冲突处理。

**【PM填写】**
- Export Json 格式：你可以自己写,只要包含了全部数据
- Import Json 校验规则：和你export的一致
- 导入时是覆盖、合并还是新建：覆盖
- Push/Pull 的同步目标：服务器,这一版没有.
- 冲突解决策略：事件,comment,task全部取并集,对id去重不同id就认为不同,task的任务状态按finished>not finished>ongoing 来

---

### PS:

添加一个ongoing tag,当创建的时候打上,当获得finished/not finished的时候撤下

## 29. Setting 页的 model 与 token 含义不清

**出处**：`look.md`

**原文**
> models:一个列表,每项有四个属性:一个baseurl,一个apikey,一个name,一个id
>
> friends:一个列表,每项有Def中的那四个文本属性
>
> token: 一个字符串

**问题**
- `token` 是同步 token、登录 token、推送 token 还是模型 token，没写。
- `friends` 这里写“那四个文本属性”，但 `def.md` 里 Friend 不止四个字段。

**【PM填写】**
- `token` 的准确用途：同步token
- `friends` 在设置页允许编辑哪些字段：全部
- `models` 是否允许新增/删除：允许
- 敏感信息是否需要加密存储：否
- 这是第一版迭代,尽量在setting里塞多的东西便于演示和调试

---

## 30. 通知、权限、隐私策略缺失

**出处**：`behavior.md`、`look.md`

**原文**
> 使用通知提醒用户
>
> location只是一个按钮用于选择是否携带当前位置,默认为开启

**问题**
- 涉及通知权限和定位权限，但没有任何权限申请时机、拒绝后策略、隐私说明。

**【PM填写】**
- 通知权限申请时机：安装时
- 定位权限申请时机：安装时
- 用户拒绝后的降级方案：不通知,定位留空
- 隐私提示文案是否需要产品提供：否,等上线的时候在做

---

## 31. Web 与移动端的能力边界未说明

**出处**：`def.md`、`tech.md`

**原文**
> platform: phone mainly. web also.
>
> 使用capacitor完成跨平台
>
> 数据存储使用Sqlite(capacitor插件)

**问题**
- SQLite 的 capacitor 插件主要是移动端思路，Web 端怎么落地未写。
- 也没写哪些能力仅移动端可用，例如拍摄、通知、定位、本地数据库。

**【PM填写】**
- Web 端是否为正式支持平台：是
- Web 端的数据存储方案：index DB
- Web 端不支持的功能列表：拍摄,通知;
- 各平台能力差异说明是否需要在产品中展示：下一班的事

---

## 32. 名词和命名需要统一

**出处**：`behavior.md`、`look.md`、`tech.md`

**原文**
> onTaskCompelete
>
> CameraButon
>
> lagency
>
> Dairy
>
> Vue+Iconic

**问题**
- 文档中存在明显拼写不统一，容易直接污染代码字段名、事件名和页面名。

**【PM填写】**
- 统一命名表：
- `Dairy` 是否应为 `Diary`是
- `Iconic` 是否应为 `Ionic`：是
- 事件名、字段名最终命名规范：全部使用英文小写+下划线;类名首字母大写+驼峰

