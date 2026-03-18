# UI 

## UI Components:

### Event Abstract

事件摘要

展示内容包括:

- 事件标题
- 文本展示前config.abstract_show_content_length个字符
- 图片展示前config.abstract_show_picture_count个
- tag的优先级最高的前config.abstract_show_tag_count个
- comments的前config.abstract_show_comment_count个

从上到下顺序为标题(同行显示tag),文本,图片(横向排列)

对Task额外展示一个"完成"按钮.

### Event Flow:

按时间顺序展示Event Abstract,点击某个Event Abstract进入Event Detail界面

界面上应显示为左侧有一个竖直的时间轴线条,右侧展示Event Abstract垂直布局.

不分页,无限滚动

组件最上方时筛选器:一个日期控件,以及tags,展示当前显示的tags,当点击tags时会弹出一个TagsWindow

### InputBox

创建一个Event的地方

一个文本框,初始高度不高,但自动把高度变为文字内容+2行

文本框下方为工具箱:
- 第一行横排若干个按钮成一行:相机,图片,视频,音频,链接,标签,发送,
- 点击标签时应该弹出TagsWindow窗口

对于上传的资源,竖直排版展示在这排按钮的下面

当上传资源过多/文字过多时,滚动条整体滚动三部分,但按钮一行会在到达屏幕顶部后保持在顶部/到达屏幕底部后保持在底部

### CameraButon

InputBox的捷径,使用摄像机上传一张图像/视频,其他值全部默认

### TagsWindow

type:filter/create

从上到下包括
- 已经选择的标签(横向排列,多的时候多行)
- 左右排列:
  - 标签分类(nature/mood/others/location)
    - type为create时location只是一个按钮用于选择是否携带当前位置,不切换选项卡,默认为开启
  - 某个分类下的所有标签,按上次使用该标签的时间排序(优先展示最近使用的)
    - type为filter的时候location选项卡里的选法不是标签的集合,而是国家,省份,城市,区的级联选择.默认为当前位置.

### Detail

一整个页面用于展示一个事件,从上到下包括内容:

- 事件
  - 日期 + 标题(同行)
  - 标签(tag)
  - 正文(content)
  - 多媒体资源(assets)
- 评论
  - 按日期排序,一个切换从新到旧/从旧到新的按钮

### Dairy

一个类似书的视图,手机上为单栏,电脑为双栏

每一个有Event的Day生成若干页,再把所有页按顺序放到一起形成一本书.

对于一天,先有一个标题+日期,然后是依次排列每件事(标题+tags+raw+assets+comments),最后是这一天的summary

### Summary

每间隔若干时间生成一个 Summary.间隔时间为config.summary_intervals{}中的某一项就生成一次总结.每一项为一个字符串,单位包括("d","m","y")

确定了Summary内容后,根据一个模板生成一个html字符串.

每个总结是一个Mail,content为html字符串

## UI

上面一行工具栏,下方一行页面切换选项卡(导航栏),中间是不同的切换的Pages

### 导航栏:

#### New(2)

#### Event Flow(3)

#### Tasks(1)

#### My(4)

### Pages

#### Event Flow

放一个Event Flow

#### New

一个 InputBox

#### My

一个可点击的列表:
- Mailbox
- Dairy Page
- Setting
- Data

#### Tasks

一个Event Flow,但不显示筛选工具,但强制只显示所有task

页面下方一个文本框和一个发送按钮

#### Mailbox

一个Mail的列表,点击后通过Mail Page显示某个Mail

#### Mail Page

顶上一个标题栏显示Mail的标题,然后一行是时间+sender,剩余内容一个巨大的webview

#### Dairy Page

展示Dairy

#### Data

几个按钮选项:

Export Json
Import Json
Export Dairy
Export Mails

Push
Pull

#### Setting

models:一个列表,每项有四个属性:一个baseurl,一个apikey,一个name,一个id

friends:一个列表,每项有Def中的那四个文本属性

token: 一个字符串