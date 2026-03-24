# Server v0.0

## 目标

v0.0 服务端只解决一件事：稳定接收并保存 AI 任务结果。

本版明确不做：

- 不做多端同步
- 不做服务端 Friend / Event / Summary 持久化
- 不做流式返回
- 不做分布式队列
- 不做多 worker

本版明确要做：

- `Python + FastAPI + SQLite`
- 一个进程内单线程 worker
- 用户注册、登录、退出登录
- token 鉴权
- 服务端维护模型列表
- 服务端接收任务、执行任务、返回结果、等待客户端 ack
- 服务端接管 `dealing_img` 判断和图片模型回退逻辑

## 总体思路

客户端不再直连模型提供商。

新链路：

1. 客户端注册或登录，拿到服务端认证 token。
2. 客户端拉取服务端模型列表，Friend 只保存服务端模型 `model_id`。
3. 客户端创建 AI 任务，提交原始 `request_body`。
4. 服务端把任务写入 SQLite 的 `current_requests`。
5. 单线程 worker 串行读取任务，并根据目标模型决定是否直接带图请求，或先走图片模型摘要。
6. 服务端保存最终 AI 回复文本。
7. 客户端按任务 ID 轮询结果。
8. 客户端本地落盘成功后，调用 ack。
9. 服务端删除当前任务表中的正文，仅保留统计表元数据。

## 远端任务状态

服务端任务状态固定为：

- `queued`
  - 已入库，等待 worker 处理
- `running`
  - worker 已开始处理
  - 如果 worker 正在内部重试，状态仍保持 `running`
- `succeeded`
  - 服务端已经拿到完整 AI 回复并保存
- `failed`
  - 服务端确认终态失败，不再自动重试
- `acknowledged`
  - 客户端已确认本地落盘成功，服务端正文可删

重试相关元数据：

- `retry_count`
  - 表示当前任务已经重试了几次
  - 第一次真正开始调用上游前为 `0`
  - 每次内部重试前加 `1`

## 非目标

- 不做 WebSocket / SSE
- 不做 JWT
- 不做多设备登录态管理
- 不做服务端业务结构化解析
- 不做图片、音频、视频文件长期托管

## 鉴权

v0.0 鉴权方案保持简单：

- 账号体系：`username + password`
- 登录态：服务端签发一个不透明随机 token
- token 通过 `Authorization: Bearer <token>` 传输
- 每个用户同一时刻只保留一个有效 token
- `signin` 会轮换 token
- `signout` 会使当前 token 失效

安全规则：

- 数据库中只保存 `password_hash`
- 数据库中只保存 `auth_token_hash`，不保存明文 token
- 明文 token 仅在 `signup/signin` 响应中返回一次
- 默认 token 有效期：30 天

`users` 表建议字段：

- `id`
- `username`
- `password_hash`
- `auth_token_hash`
- `auth_token_expires_at`
- `created_at`
- `updated_at`
- `last_signin_at`

说明：

- `password` 不能出现在任务表里
- 认证 token 和模型 token 用量不是一个概念，命名必须分开

## 模型管理

客户端不再保存 `base_url`、`api_key`、`img_dealing`。

这些信息统一放到服务端模型表中，由服务端维护。

### 模型表

新增 `models` 表。

业务字段按你指定的最小集合：

- `name`
- `baseurl`
- `apikey`
- `model`
- `dealing_img`

实现层还需要一个主键：

- `id`

建议完整字段：

- `id`
- `name`
- `baseurl`
- `apikey`
- `model`
- `dealing_img`
- `created_at`
- `updated_at`

字段说明：

- `name`：展示给客户端看的模型名
- `baseurl`：上游 OpenAI-compatible 服务地址
- `apikey`：该模型对应的上游密钥
- `model`：真正传给上游的模型名
- `dealing_img`：是否支持直接图片输入

说明：

- `provider` 不强制单独存到 `models` 表；v0.0 中由服务端根据 `baseurl` 归一化推导
- 客户端永远拿不到 `baseurl` 和 `apikey`

### `GET /api/v1/models`

客户端只拿安全字段，不拿机密字段。

建议返回：

- `id`
- `name`

可选返回：

- `model`

不返回：

- `baseurl`
- `apikey`
- `dealing_img`

这样前端就不会再基于 `dealing_img` 做本地判断。

## 图片能力判断与回退

当前前端本地有一套逻辑：

- 如果目标模型支持图片输入，就直接带图请求
- 如果目标模型不支持图片输入，就先用一个支持图片的模型做图片摘要，再把摘要文本交给目标模型

这套逻辑目前在本地实现，典型位置在：

- [app-store.ts](/C:/Projects/ashdairy/src/store/app-store.ts)

v0.0 改成：

- 前端不再判断 `img_dealing`
- 前端只按业务需要构造请求正文，遇到图片就照常把图片内容放进 `request_body`
- 服务端根据目标 `model_id` 对应的 `dealing_img` 做判断

服务端规则：

1. 如果目标模型 `dealing_img = 1`，直接用目标模型请求上游。
2. 如果目标模型 `dealing_img = 0`，且请求体中包含图片输入：
   - 服务端先选一个 `dealing_img = 1` 的模型做图片摘要
   - 把图片摘要文本写回最终发给目标模型的请求
   - 再用目标模型完成最终生成
3. 如果目标模型 `dealing_img = 0`，且系统里没有任何可用的图片模型：
   - 任务失败
   - `error_code = image_model_unavailable`

v0.0 图片回退模型选择规则：

- 选择 `models` 表中按 `id` 升序找到的第一个 `dealing_img = 1` 的模型

这条规则先求简单可实现，后续再做更复杂的路由。

## API

统一前缀：`/api/v1`

### `POST /auth/signup`

作用：

- 创建用户
- 自动登录
- 返回认证 token

请求体：

```json
{
  "username": "miaox",
  "password": "plain-text-password"
}
```

响应：

```json
{
  "user": {
    "id": "usr_123",
    "username": "miaox"
  },
  "token": "raw-auth-token",
  "expires_at": "2026-04-22T12:00:00Z"
}
```

规则：

- `username` 唯一
- 服务端校验最小密码长度
- 注册成功后直接签发 token

### `POST /auth/signin`

作用：

- 校验账号密码
- 轮换 token

请求体：

```json
{
  "username": "miaox",
  "password": "plain-text-password"
}
```

响应格式与 `signup` 一致。

### `POST /auth/signout`

受保护接口。

作用：

- 当前 token 失效

请求体：

```json
{}
```

响应：

```json
{
  "ok": true
}
```

### `GET /models`

受保护接口。

作用：

- 返回 Friend 可选模型列表

响应：

```json
{
  "items": [
    {
      "id": "mdl_1",
      "name": "GPT-4.1 Mini"
    }
  ]
}
```

规则：

- 返回字段尽量精简
- 不暴露 `baseurl`、`apikey`、`dealing_img`

### `POST /ai/tasks`

受保护接口。

作用：

- 创建一个异步 AI 任务

请求体：

```json
{
  "client_request_id": "evt_123:friend_a:generate:2026-03-23T22:12:00Z",
  "model_id": "mdl_1",
  "request_body": {
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "..." }
    ],
    "temperature": 0.8,
    "max_tokens": 1600
  }
}
```

响应：

```json
{
  "task": {
    "id": "task_123",
    "client_request_id": "evt_123:friend_a:generate:2026-03-23T22:12:00Z",
    "state": "queued",
    "model_id": "mdl_1",
    "created_at": "2026-03-23T22:12:01Z"
  }
}
```

规则：

- `request_body` 在数据库中按文本保存
- 幂等键为 `(user_id, client_request_id)`
- 若相同 `client_request_id` 再次提交，直接返回已有任务
- 服务端校验 `model_id` 是否存在

### `GET /ai/tasks/{task_id}`

受保护接口。

作用：

- 轮询任务状态
- 在 ack 前返回最终 AI 文本

运行中响应示例：

```json
{
  "task": {
    "id": "task_123",
    "state": "running",
    "model_id": "mdl_1",
    "retry_count": 1,
    "created_at": "2026-03-23T22:12:01Z",
    "started_at": "2026-03-23T22:12:03Z"
  }
}
```

成功响应示例：

```json
{
  "task": {
    "id": "task_123",
    "state": "succeeded",
    "model_id": "mdl_1",
    "retry_count": 1,
    "ai_response": "{\"comment\":\"...\"}",
    "usage": {
      "prompt_tokens": 321,
      "completion_tokens": 144,
      "total_tokens": 465
    },
    "created_at": "2026-03-23T22:12:01Z",
    "started_at": "2026-03-23T22:12:03Z",
    "finished_at": "2026-03-23T22:12:11Z",
    "error_code": null
  }
}
```

ack 后响应示例：

```json
{
  "task": {
    "id": "task_123",
    "state": "acknowledged",
    "model_id": "mdl_1",
    "retry_count": 1,
    "created_at": "2026-03-23T22:12:01Z",
    "finished_at": "2026-03-23T22:12:11Z"
  }
}
```

规则：

- ack 前主要查 `current_requests`
- ack 后主要查 `request_stats`
- `ai_response` 只在当前任务表还保留正文时返回

### `POST /ai/tasks/{task_id}/ack`

受保护接口。

作用：

- 客户端确认已经本地落盘成功

请求体：

```json
{}
```

响应：

```json
{
  "ok": true
}
```

规则：

- 只有终态任务允许 ack
- ack 写入 `acked_at`
- ack 后删除 `current_requests` 中该任务正文行
- `request_stats` 中元数据保留

## 数据库

v0.0 共四张表：

- `users`
- `models`
- `current_requests`
- `request_stats`

### `users`

作用：

- 本地账号认证

字段：

- `id`
- `username`
- `password_hash`
- `auth_token_hash`
- `auth_token_expires_at`
- `created_at`
- `updated_at`
- `last_signin_at`

### `models`

作用：

- 存服务端模型配置

字段：

- `id`
- `name`
- `baseurl`
- `apikey`
- `model`
- `dealing_img`
- `created_at`
- `updated_at`

规则：

- `apikey` 只在服务端可见
- 客户端只拿脱敏后的模型列表
- `dealing_img` 只给 worker 用，不给前端用

### `current_requests`

作用：

- 存当前任务
- 存原始请求文本
- 存最终 AI 回复文本

字段：

- `id`
- `user_id`
- `client_request_id`
- `state`
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
- `model_id`
- `model_name`
- `provider`
- `request_body`
- `ai_response`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `retry_count`
- `error_code`
- `error_message`
- `created_at`
- `started_at`
- `finished_at`
- `updated_at`
- `acked_at`

规则：

- `request_body` 保存纯文本 JSON
- `ai_response` 保存纯文本
- 不做业务结构化拆表
- 不保存 password
- 不保存认证 token

说明：

- `provider` 由服务端根据 `baseurl` 归一化得到后写入，主要用于统计和排查

### `request_stats`

作用：

- 存长期统计信息

字段：

- `request_id`
- `user_id`
- `client_request_id`
- `state`
- `model_id`
- `model_name`
- `provider`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `retry_count`
- `error_code`
- `created_at`
- `started_at`
- `finished_at`
- `updated_at`
- `acked_at`

规则：

- 不保存 `request_body`
- 不保存 `ai_response`
- 不保存 password
- 不保存认证 token
- 一条任务对应一条统计记录

## Worker

v0.0 只用一个进程内单线程 worker。

worker 循环：

1. 每 500ms 到 1000ms 轮询一次 SQLite
2. 取最早的 `queued` 任务
3. 原子更新为 `running`
4. 根据 `model_id` 读取模型配置
5. 解析 `request_body`
6. 判断该请求是否包含图片输入
7. 根据 `dealing_img` 决定直接请求或先图片摘要再请求
8. 调用上游 OpenAI-compatible 接口
9. 提取最终 assistant 文本
10. 写回 `ai_response`、token 用量、终态、错误码
11. upsert `request_stats`

失败重试策略：

- 同一条任务内重试
- 建议 3 次
- 建议延迟：`5s / 15s / 30s`
- 每次重试都要更新 `retry_count`
- 有重试但尚未终止时，任务状态仍保持 `running`
- 全部失败后，状态改为 `failed`

上游调用策略：

- 使用 `OpenAI(base_url=..., api_key=...)`
- v0.0 使用 `client.chat.completions.create(...)`
- 服务端只存最终文本，不存完整上游响应体

token 用量提取：

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

## 错误码

建议错误码集合：

- `auth_invalid`
- `auth_expired`
- `model_not_found`
- `image_model_unavailable`
- `provider_timeout`
- `provider_http_error`
- `provider_invalid_response`
- `worker_internal_error`

客户端只需要：

- 终态
- `error_code`
- 可选 `error_message`

## 客户端契约

服务端不理解 Event、Friend、Summary、Tag 的业务结构。

服务端只做通用任务中转：

- 客户端发原始 OpenAI-compatible `request_body`
- 服务端按文本保存
- worker 负责模型选择、图片回退、上游调用
- 服务端返回最终 AI 文本

这样服务端和当前前端业务结构保持解耦。

## 安全默认值

- 永远 hash password
- 永远 hash auth token
- 永远不把 provider 密钥下发给客户端
- 不在生产日志里打印完整 `request_body`
- ack 后可以删除 `current_requests` 正文
- 长期只保留 `request_stats` 元数据

## 实现顺序

1. 搭起 FastAPI 应用和 SQLite 连接
2. 实现 `users` 表与认证辅助函数
3. 实现 `signup/signin/signout`
4. 实现 `models` 表与模型初始化
5. 实现 `GET /models`
6. 实现 `current_requests` 与 `request_stats`
7. 实现 `POST /ai/tasks`
8. 实现单线程 worker
9. 实现服务端图片能力判断和图片模型回退
10. 实现 `GET /ai/tasks/{task_id}`
11. 实现 `POST /ai/tasks/{task_id}/ack`
12. 补齐超时、重试、错误码映射
