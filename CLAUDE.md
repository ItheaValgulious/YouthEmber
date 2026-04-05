# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ember is a personal life logging mobile app built with Vue 3 + Ionic + Capacitor. It allows users to record events, tasks, receive AI-generated summaries, and get comments from AI "friends".

## Common Commands

```bash
# Development
npm install
npm run dev

# Build for web
npm run build
npm run preview

# Capacitor mobile builds
npm run cap:copy    # Copy web assets to native
npm run cap:sync    # Sync with native project
npm run cap:open:android  # Open Android Studio
npm run cap:open:ios      # Open Xcode
```

## Architecture

### State Management
All application state lives in `src/store/app-store.ts` — a single Vue reactive store managing events, tasks, tags, friends, AI jobs, mail, summaries, and diary book. State is persisted to SQLite via `database-service.ts`.

### Data Models (`src/types/models.ts`)
- **EventRecord**: Core record type — can be a regular event or a task (via `is_task` flag)
- **TaskStatus**: `ongoing` | `finished` | `not_finished` | null
- **Tag**: Categorized by type (nature, mood, people, location, others)
- **AssetRecord**: Images/videos/audio attached to events
- **FriendRecord**: AI "friend" with configurable model, personality (soul), memory file
- **PendingAiJob**: Queued AI jobs with status machine (create → poll → apply → ack)

### Services (`src/services/`)
- **database-service.ts**: SQLite persistence via Capacitor (fallback to Preferences for web)
- **file-service.ts**: Asset file handling, JSON import/export, diary HTML export
- **server-service.ts**: Auth, model fetching, remote AI task management
- **ai-service.ts**: Prompt building and response parsing for event enrichment, friend comments, summaries
- **notification-service.ts**: Local notifications for task deadlines

### Pages (`src/pages/`)
- **EventFlowPage**: Main feed showing events grouped by date
- **NewPage**: Create new events with camera/location capture
- **TasksPage**: Task list with completion/failure actions
- **MyPage**: Mailbox, diary, settings, data export panels
- **EventDetailPage**: Event detail with comments and AI friend reactions

### AI Job Queue
The app uses a sophisticated remote AI pipeline:
1. Jobs are queued in `state.ai_jobs` with status: `create_remote_task` → `poll_remote_task` → `apply_remote_result` → `ack_remote_task`
2. Server returns task ID, app polls for completion
3. Results are applied (tags enriched, friend comments added, summaries generated)
4. Retry logic with exponential backoff on failures

Friend comments have a "delivery" phase — AI generates comment, waits for configured latency, then delivers as a delayed comment on the event.

### Diary System
Events and summaries are auto-organized into diary pages with various block types (date, event text, event image, comment group, summary). Exported as standalone HTML.

## Key Configuration

- `src/config/defaults.ts`: Default tags, friends, models, app config
- `src/config/prompts.ts`: AI prompt templates
- `.env` / `.env.example`: Server API URL configuration