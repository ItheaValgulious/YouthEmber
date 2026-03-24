# v0.2 接入服务端改造计划

## 目标

v0.2 前端停止直连模型提供商，统一改为调用新的中转服务端。

本次改动范围只包括：

- 服务端注册、登录、退出登录
- 拉取服务端模型列表
- 异步任务创建、轮询、ack
- 删除本地模型配置 UI
- 删除本地 `img_dealing` 判断
- 把图片模型回退逻辑迁到后端

本次不包括：

- 多端同步
- Friend 上云
- Event / Tag / Mail / Summary 上云

## 产品变化

改造前：

- 客户端本地保存 `base_url`
- 客户端本地保存 `api_key`
- 客户端本地保存 `img_dealing`
- 客户端直接请求 provider
- 客户端自己承担不稳定接收的问题

改造后：

- 客户端只保存服务端认证 token
- 服务端保存模型配置和 provider 密钥
- Friend 仍然是本地数据，但 `friend.model_id` 来自服务端模型列表
- 客户端只和中转服务端通信
- 图片能力判断和图片模型回退由服务端负责

## 本地状态变化

### 保留

- 本地 events
- 本地 tags
- 本地 friends
- 本地 mails
- 本地 summaries
- 本地 friend memory files

### 删除

- 本地可编辑模型列表
- 本地 `base_url`
- 本地 `api_key`
- 本地 `img_dealing`

### 重新定义

当前 `state.token` 改为：

- 服务端认证 token

不再保留“未来预留字段”的含义。

建议新增本地字段：

- `auth_user_id`
- `auth_username`
- `auth_expires_at`
- `server_models`
- `pending_remote_tasks`

`server_models` 只需要保存服务端下发的安全字段：

- `id`
- `name`

`pending_remote_tasks` 只需要保存通用远端任务元数据：

- `task_id`
- `client_request_id`
- `kind`
- `owner_id`
- `local_status`
- `remote_status`
- `retry_count`
- `created_at`
- `started_at`
- `finished_at`
- `error_code`

说明：

- `local_status` 表示客户端自己当前处理到哪一步
- `remote_status` 表示服务端任务当前状态
- 当 `local_status = waiting_retry` 时，必须递增并保存 `retry_count`

## UI 改动

### 认证

新增认证入口：

- signup
- signin
- signout

v0.2 最小规则：

- 没有有效 token 时，禁止新的 AI 行为
- 已有本地内容仍可浏览

### Setting 页面

删除：

- 本地模型增删改
- 本地 `base_url` 编辑
- 本地 `api_key` 编辑

新增：

- 当前登录状态
- 当前用户名
- signout 按钮
- 刷新模型列表按钮

### Friend 编辑

Friend 仍然本地保存，但模型选择来源改掉：

- 下拉框数据来自 `GET /api/v1/models`
- Friend 本地只保存服务端模型 `id`
- 不再依赖本地模型配置

如果本地保存的 `model_id` 已经不在服务端模型列表中：

- 本地先保留原始值
- UI 标记为“模型不可用”
- 阻止继续发起新的 AI 请求
- 要求用户重新选择有效模型

## 服务层改动

### 替换现有 `ai-service`

当前直接请求 provider 的代码在：

- [ai-service.ts](/C:/Projects/ashdairy/src/services/ai-service.ts)

要改成“服务端客户端”。

新职责：

- `signup(username, password)`
- `signin(username, password)`
- `signout()`
- `getModels()`
- `createTask(input)`
- `getTask(taskId)`
- `ackTask(taskId)`

新的服务层绝不能知道：

- provider `base_url`
- provider `api_key`
- `img_dealing`

### 新的任务入参

前端仍然在本地构造 prompt，但不再传 provider 级配置。

每个 AI 任务发送：

- `client_request_id`
- `model_id`
- `request_body`

其中：

- `model_id` 是服务端模型表主键
- `request_body` 保持 OpenAI-compatible JSON

## 图片相关逻辑迁移

这是本次改动最重要的一部分。

### 当前本地逻辑

目前本地有以下逻辑：

- `getFirstImageCapableModel`
- `summarizeEventImages`
- `buildSingleEventVisualContext`
- `buildImageSummaryByEventId`

这些逻辑依赖本地 `img_dealing` 判断，代码集中在：

- [app-store.ts](/C:/Projects/ashdairy/src/store/app-store.ts)

### 改造后逻辑

前端不再判断目标模型是否支持图片。

新的前端规则：

- 如果业务上需要带图，就把图片内容照常放进 `request_body`
- 不再本地挑选“可处理图片的模型”
- 不再本地先做图片摘要
- 不再维护本地 `img_dealing`

新的后端规则：

- 服务端根据 `model_id` 查 `models.dealing_img`
- 若目标模型支持图片输入，则直接请求
- 若目标模型不支持图片输入，则服务端先选一个 `dealing_img = 1` 的模型做图片摘要，再把摘要文本交给目标模型

这意味着前端要删掉整套本地图片能力分流逻辑。

## AI 流程变化

### 当前问题

当前 store 会创建本地 job，并由客户端直接发 provider 请求。

相关位置：

- [app-store.ts](/C:/Projects/ashdairy/src/store/app-store.ts)
- [ai-service.ts](/C:/Projects/ashdairy/src/services/ai-service.ts)

### 新流程

1. 本地业务逻辑判断需要 AI。
2. 前端调用服务端创建任务。
3. 本地保存返回的 `task_id`。
4. 前端轮询该任务直到终态。
5. 成功后解析 `ai_response`。
6. 前端把结果应用到本地业务数据。
7. 本地持久化成功后调用 ack。

### 重试语义变化

当前重试等于：

- 再生成一次

改造后重试应变成：

- 继续轮询同一个 `task_id`

只有创建任务阶段才允许依赖 `client_request_id` 幂等。

## Store 改造

### 保留本地 AI job 调度概念

本地队列可以保留，但语义要变。

之前：

- 队列项代表“直接请求 provider”

之后：

- 队列项代表“远端任务生命周期”

建议本地阶段：

- `create_remote_task`
- `poll_remote_task`
- `apply_remote_result`
- `ack_remote_task`
- `waiting_retry`
- `done`
- `failed`

### 本地状态定义

建议本地只保留这一套 `local_status`：

- `create_remote_task`
  - 还没有拿到 `task_id`
- `poll_remote_task`
  - 已经拿到 `task_id`，正在轮询远端状态
- `apply_remote_result`
  - 远端已经成功，正在本地解析和落地业务结果
- `ack_remote_task`
  - 本地结果已经写完，正在发 ack
- `waiting_retry`
  - 当前这一步失败，但之后还会自动重试
  - 必须记录 `retry_count`
- `done`
  - 本地链路已经完整结束
- `failed`
  - 本地确认终态失败，不再自动重试

### 远端状态定义

本地还需要记录服务端返回的 `remote_status`：

- `queued`
- `running`
- `succeeded`
- `failed`
- `acknowledged`

### 业务结果仍然本地落地

服务端只返回 AI 文本，不负责业务写入。

这些业务写入仍在本地完成：

- event enrichment 更新 title / tags
- friend comment 更新 comments / memory
- summary generation 更新 mails / summaries

## 失败处理

任务创建失败：

- 保留本地 job
- 用同一个 `client_request_id` 重试创建
- 本地状态改为 `waiting_retry`
- `retry_count += 1`

轮询失败：

- 不创建新远端任务
- 继续轮询同一个 `task_id`
- 本地状态改为 `waiting_retry`
- `retry_count += 1`

本地解析失败：

- 不立刻 ack
- 直接并入 `failed`
- 这类失败覆盖原来单独的 `needs_recovery`

ack 失败：

- 本地结果已经有效
- 仅保留一个待 ack 的轻量记录
- 后续补 ack
- 本地状态改为 `waiting_retry`
- `retry_count += 1`

本地自动重试上限建议：

- `retry_count <= 3` 时保持 `waiting_retry`
- 超过上限后改为 `failed`

## 启动流程变化

应用启动时：

1. 读取本地状态
2. 恢复 auth token
3. 若有 token，则拉取服务端模型列表
4. 恢复本地 pending remote tasks 的轮询

若 token 失效：

- 清掉认证状态
- 不清本地 diary 数据
- 后续 AI 行为必须重新登录

## 文件级改动方向

主要受影响文件：

- [src/services/ai-service.ts](/C:/Projects/ashdairy/src/services/ai-service.ts)
- [src/store/app-store.ts](/C:/Projects/ashdairy/src/store/app-store.ts)
- [src/pages/MyPage.vue](/C:/Projects/ashdairy/src/pages/MyPage.vue)
- [src/types/models.ts](/C:/Projects/ashdairy/src/types/models.ts)

次要受影响区域：

- 当前编辑本地模型配置的 Setting UI
- 当前读取本地模型列表的 Friend 编辑 UI
- [src/main.ts](/C:/Projects/ashdairy/src/main.ts) 中的启动恢复流程

## 关键删除项

前端需要删掉或彻底降级的内容：

- 本地模型 CRUD
- 本地 provider 配置
- 本地 `img_dealing`
- 本地“如果目标模型不支持图片，则先找图片模型摘要”的判断逻辑

## 建议实现顺序

1. 先接入服务端 auth 和 token 持久化。
2. 接入 `GET /models` 并保存服务端模型列表。
3. 删除本地模型配置 UI。
4. 改 Friend 的模型选择为服务端模型列表。
5. 用服务端任务 API 替换直接 provider 请求。
6. 删除本地 `img_dealing` 判断和图片回退逻辑。
7. 将本地 AI jobs 改成远端任务生命周期 jobs。
8. 补齐 pending ack 重试。
