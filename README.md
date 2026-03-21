# Ember v0.1

基于 `plan/v1` 文档实现的第一版可运行软件原型。

## 当前版本

- 使用 `Vue 3 + Ionic + Vite` 搭建移动端风格界面
- 覆盖 Event Flow / New / Tasks / My 四个主入口
- 支持事件创建、任务创建、任务完成/放弃、详情页追加评论
- 支持本地模拟 AI 异步补全：标题、标签、Friend 评论、Summary Mail
- 支持 Summary Mail、Diary 预览、Settings、Json/HTML 导入导出

## Demo 适配说明

为保证第一版能直接在当前仓库跑起来，这一版做了两处工程化适配：

- 本地持久化当前使用 `localStorage`，并保留了后续替换为 SQLite/Filesystem 的数据结构与服务边界
- AI 队列、Friend 延迟与重试在 demo 中按秒级缩放模拟，便于本地预览异步补全过程

## 启动

```bash
npm install
npm run dev
```

## 对应 plan 范围

当前版本优先实现：

- 文档中的核心数据结构
- Event / Task 主流程
- Friend 评论公式与异步队列
- Summary Mail 的 HTML 渲染
- Diary / Data / Setting 的第一版闭环

尚未接入的原生能力包括：

- Capacitor SQLite / Filesystem 真机落地
- Camera / Geolocation / Local Notifications 原生插件
- 服务端 Push / Pull 与同步


## Capacitor Integration (Current)

- Added `capacitor.config.ts`
- Added `CameraService`, `FileService`, `LocationService`, `DatabaseService` under `src/services`
- Native storage uses `@capacitor-community/sqlite`; web currently uses `Preferences` as a lightweight fallback
- `New` page now supports camera capture, gallery import, media upload, and current-location capture
- `Data` export now bundles structured state together with media payloads for re-import

### Useful Commands

```bash
npm run build
npm run cap:copy
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```
