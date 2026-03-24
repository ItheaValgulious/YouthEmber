# Ashdairy Server

## 当前实现

- `Python + FastAPI + SQLite`
- 单进程内多线程 worker
- 用户注册、登录、登出，使用 Bearer Token 鉴权
- 服务端模型列表
- 异步 AI 任务创建、查询、ack
- 服务端图片能力判断与图片摘要回退

## 目录说明

- `app/`: FastAPI 应用、服务层、worker
- `config/models.json`: 模型种子配置。启动时会按 `id` 对数据库中的模型做插入或更新
- `config/models.example.json`: 示例配置
- `data/`: SQLite 数据目录
- `.venv/`: Python 虚拟环境

## 启动步骤

1. 创建虚拟环境

```powershell
python -m venv .venv
```

2. 安装依赖

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. 编辑 `config/models.json`

至少需要准备一条真实模型配置，例如：

```json
[
  {
    "id": "mdl_text_1",
    "name": "OpenRouter GPT-4.1 Mini",
    "baseurl": "https://openrouter.ai/api/v1",
    "apikey": "replace-with-real-api-key",
    "model": "openai/gpt-4.1-mini",
    "dealing_img": false,
    "timeout_seconds": 90
  }
]
```

字段说明：

- `dealing_img`: 该模型是否支持直接处理图片
- `timeout_seconds`: 模型级上游超时；如果未配置，则回退到全局 `ASHDAIRY_SERVER_UPSTREAM_TIMEOUT_SECONDS`

如果还要支持“文本模型 + 图片模型摘要回退”，需要再准备至少一条 `dealing_img = true` 的模型。

4. 启动服务

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

开发时可用 `--reload`：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 默认行为

- SQLite 默认路径：`data/ashdairy.db`
- Worker 会随 FastAPI 应用自动启动，默认使用 `3` 个线程
- `GET /api/v1/models` 只返回安全字段，不返回 `baseurl`、`apikey`、`dealing_img`、`timeout_seconds`
- 任务结果在客户端 `ack` 前保存在 `current_requests`
- `ack` 后正文会从 `current_requests` 删除，仅保留 `request_stats` 元数据

## 可选环境变量

- `ASHDAIRY_SERVER_DB_PATH`
- `ASHDAIRY_SERVER_MODELS_SEED_PATH`
- `ASHDAIRY_SERVER_AUTH_TOKEN_TTL_DAYS`
- `ASHDAIRY_SERVER_WORKER_THREAD_COUNT`
- `ASHDAIRY_SERVER_WORKER_POLL_INTERVAL_SECONDS`
- `ASHDAIRY_SERVER_WORKER_RETRY_DELAYS`
- `ASHDAIRY_SERVER_UPSTREAM_TIMEOUT_SECONDS`
