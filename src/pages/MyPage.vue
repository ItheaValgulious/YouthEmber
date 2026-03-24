<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>{{ ui.t('app_my') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap desk-stack">
        <section class="paper-sheet paper-sheet--compact my-switcher">
          <div class="my-switcher__inner">
            <div>
              <div class="ink-label handwritten">{{ ui.t('inside_notebook') }}</div>
              <h2 class="ink-title">{{ ui.t('my_space') }}</h2>
            </div>

            <div class="row wrap">
              <ion-button
                v-for="panel in panels"
                :key="panel.key"
                :fill="store.state.last_opened_my_panel === panel.key ? 'solid' : 'outline'"
                @click="store.selectMyPanel(panel.key)"
              >
                {{ panel.label }}
              </ion-button>
            </div>
          </div>
        </section>

        <section v-if="store.state.last_opened_my_panel === 'mailbox'" class="paper-sheet my-panel">
          <div class="my-panel__head row between wrap">
            <div>
              <div class="ink-label handwritten">{{ ui.t('collected_letters') }}</div>
              <h2 class="ink-title">{{ ui.t('mailbox') }}</h2>
            </div>

            <div class="row wrap">
              <ion-button fill="outline" :disabled="!canUseAi" @click="generateSummary('7d')">
                {{ ui.t('summary_interval_label', { interval: '7d' }) }}
              </ion-button>
              <ion-button fill="outline" :disabled="!canUseAi" @click="generateSummary('3m')">
                {{ ui.t('summary_interval_label', { interval: '3m' }) }}
              </ion-button>
              <ion-button fill="outline" :disabled="!canUseAi" @click="generateSummary('1y')">
                {{ ui.t('summary_interval_label', { interval: '1y' }) }}
              </ion-button>
            </div>
          </div>

          <div class="paper-stack">
            <div v-if="!canUseAi" class="empty-note">
              {{ label('当前未连接服务端 AI。请先到 Setting 登录并刷新模型列表。', 'AI is not connected yet. Sign in and refresh models in Settings first.') }}
            </div>

            <ion-item
              v-for="mail in store.sortedMails.value"
              :key="mail.id"
              button
              detail
              class="mail-list-button my-mail-item"
              @click="openMail(mail.id)"
            >
              <ion-label>
                <h2>{{ mail.title }}</h2>
                <p>{{ store.formatDateTime(mail.time) }} / {{ mail.sender }}</p>
              </ion-label>
            </ion-item>

            <div v-if="!store.sortedMails.value.length" class="empty-note">
              {{ ui.t('no_mail_yet') }}
            </div>
          </div>
        </section>

        <section v-else-if="store.state.last_opened_my_panel === 'diary'" class="my-diary-panel">
          <DiaryBookView />
        </section>

        <section v-else-if="store.state.last_opened_my_panel === 'setting'" class="desk-stack">
          <section class="paper-sheet my-panel">
            <div class="my-panel__head">
              <div class="ink-label handwritten">{{ ui.t('runtime') }}</div>
              <h2 class="ink-title">{{ ui.t('environment') }}</h2>
            </div>
            <div class="empty-note">
              {{ ui.t('platform') }}: {{ platformLabel }}<br />
              {{ ui.t('storage') }}: {{ databaseService.driverLabel }}<br />
              {{ label('服务端 API', 'Server API') }}:
              {{ serverConfigured ? serverBaseUrl : label('未配置', 'Not configured') }}
            </div>
            <div v-if="store.latestAiFailure.value" class="empty-note my-debug-note">
              AI job: {{ store.latestAiFailure.value.type }}<br />
              {{ label('状态', 'Status') }}: {{ store.latestAiFailure.value.status }}<br />
              Error: {{ store.latestAiFailure.value.last_error }}
            </div>
          </section>

          <section class="paper-sheet my-panel">
            <div class="my-panel__head row between wrap">
              <div>
                <div class="ink-label handwritten">{{ label('账号认证', 'Account') }}</div>
                <h2 class="ink-title">{{ label('服务端登录', 'Server Sign In') }}</h2>
              </div>

              <ion-button
                v-if="isAuthenticated"
                color="danger"
                fill="outline"
                size="small"
                :disabled="authBusy"
                @click="handleSignout"
              >
                {{ label('退出登录', 'Sign out') }}
              </ion-button>
            </div>

            <div class="paper-stack">
              <div class="empty-note">
                {{ label('登录只影响 AI 能力，不会影响本地 diary 数据。', 'Sign-in only affects AI features and does not touch local diary data.') }}
              </div>

              <div v-if="isAuthenticated" class="preview-card my-config-card">
                <div class="paper-stack">
                  <div><strong>{{ label('当前用户', 'Current user') }}:</strong> {{ store.state.auth_username }}</div>
                  <div><strong>{{ label('用户 ID', 'User ID') }}:</strong> {{ store.state.auth_user_id }}</div>
                  <div>
                    <strong>{{ label('到期时间', 'Expires at') }}:</strong>
                    {{ store.state.auth_expires_at ? store.formatDateTime(store.state.auth_expires_at) : '-' }}
                  </div>
                  <div class="row wrap">
                    <ion-button fill="outline" size="small" :disabled="authBusy || !serverConfigured" @click="handleRefreshModels">
                      {{ label('刷新模型列表', 'Refresh models') }}
                    </ion-button>
                  </div>
                </div>
              </div>

              <div v-else class="preview-card my-config-card">
                <div class="paper-stack">
                  <label>
                    <div class="section-title">{{ label('用户名', 'Username') }}</div>
                    <input v-model="authUsername" class="native-input" autocomplete="username" />
                  </label>
                  <label>
                    <div class="section-title">{{ label('密码', 'Password') }}</div>
                    <input
                      v-model="authPassword"
                      class="native-input"
                      autocomplete="current-password"
                      type="password"
                    />
                  </label>
                  <div class="row wrap">
                    <ion-button :disabled="authBusy || !serverConfigured" @click="handleAuth('signin')">
                      {{ label('登录', 'Sign in') }}
                    </ion-button>
                    <ion-button fill="outline" :disabled="authBusy || !serverConfigured" @click="handleAuth('signup')">
                      {{ label('注册', 'Sign up') }}
                    </ion-button>
                  </div>
                  <div v-if="!serverConfigured" class="empty-note">
                    {{ label('还没有配置服务端 API 地址，所以现在只能先把前端接好。', 'The server API URL is not configured yet.') }}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="paper-sheet my-panel">
            <div class="my-panel__head">
              <div class="ink-label handwritten">{{ ui.t('runtime_config') }}</div>
              <h2 class="ink-title">{{ ui.t('runtime_config') }}</h2>
            </div>

            <div class="paper-stack">
              <label>
                <div class="section-title">{{ ui.t('pre_alert') }}</div>
                <input
                  :value="store.state.config.pre_alert"
                  class="native-input"
                  min="0"
                  step="1"
                  type="number"
                  @input="handlePreAlertChange"
                />
              </label>
              <label>
                <div class="section-title">{{ ui.t('alert_time') }}</div>
                <input :value="store.state.config.alert_time" class="native-input" type="time" @input="handleAlertTimeChange" />
              </label>
            </div>
          </section>

          <section class="paper-sheet my-panel">
            <div class="my-panel__head">
              <div class="ink-label handwritten">{{ label('服务端模型', 'Server models') }}</div>
              <h2 class="ink-title">{{ label('模型列表', 'Model list') }}</h2>
            </div>

            <div class="paper-stack">
              <div class="row wrap">
                <ion-button fill="outline" size="small" :disabled="authBusy || !canRefreshModels" @click="handleRefreshModels">
                  {{ label('刷新模型列表', 'Refresh models') }}
                </ion-button>
              </div>

              <div v-if="store.state.models.length" class="paper-stack">
                <div v-for="model in store.state.models" :key="model.id" class="preview-card my-config-card">
                  <div class="paper-stack">
                    <div><strong>{{ ui.t('name') }}:</strong> {{ model.name }}</div>
                    <div><strong>{{ ui.t('identifier') }}:</strong> {{ model.id }}</div>
                  </div>
                </div>
              </div>

              <div v-else class="empty-note">
                {{ label('当前没有可用模型。登录后请手动刷新一次。', 'No models are available yet. Refresh after signing in.') }}
              </div>
            </div>
          </section>

          <section class="paper-sheet my-panel">
            <div class="my-panel__head">
              <div class="ink-label handwritten">{{ ui.t('appearance') }}</div>
              <h2 class="ink-title">{{ ui.t('appearance') }}</h2>
            </div>

            <div class="paper-stack">
              <label>
                <div class="section-title">{{ ui.t('language') }}</div>
                <select :value="ui.state.locale" class="native-select" @change="handleLocaleChange">
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                <div class="section-title">{{ ui.t('paper_theme') }}</div>
                <select :value="ui.state.paperTheme" class="native-select" @change="handlePaperThemeChange">
                  <option value="plain-paper">{{ ui.t('plain_paper') }}</option>
                  <option value="warm-scrapbook">{{ ui.t('warm_scrapbook') }}</option>
                  <option value="ink-studio">{{ ui.t('ink_studio') }}</option>
                </select>
              </label>
              <label>
                <div class="section-title">{{ ui.t('diary_paper_size') }}</div>
                <select :value="store.state.config.diary_paper_size" class="native-select" @change="handleDiaryPaperSizeChange">
                  <option value="B5">{{ ui.t('b5_paper') }}</option>
                  <option value="B6">{{ ui.state.locale === 'zh-CN' ? 'B6 竖版' : 'B6 portrait' }}</option>
                </select>
              </label>
              <label>
                <div class="section-title">{{ ui.state.locale === 'zh-CN' ? '日记字号' : 'Diary font size' }}</div>
                <select :value="store.state.config.diary_font_scale" class="native-select" @change="handleDiaryFontScaleChange">
                  <option v-for="option in diaryFontOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </div>
          </section>

          <section class="paper-sheet my-panel">
            <div class="my-panel__head row between wrap">
              <div>
                <div class="ink-label handwritten">{{ ui.t('friend_roster') }}</div>
                <h2 class="ink-title">{{ ui.t('friend_roster') }}</h2>
              </div>
              <ion-button fill="outline" size="small" @click="handleAddFriend">{{ ui.t('add_friend') }}</ion-button>
            </div>

            <div class="paper-stack">
              <div v-for="(friend, index) in friendDrafts" :key="friend.ui_key" class="preview-card my-config-card">
                <div class="paper-stack">
                  <label class="row between">
                    <strong>{{ ui.t('enabled') }}</strong>
                    <input :checked="friend.enabled" type="checkbox" @change="updateFriendEnabled(index, $event)" />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('name') }}</div>
                    <input
                      :value="friend.name"
                      class="native-input"
                      @input="updateFriendField(index, 'name', readText($event))"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('identifier') }}</div>
                    <input
                      :value="friend.id"
                      class="native-input"
                      @input="updateFriendField(index, 'id', readText($event))"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ label('服务端模型', 'Server model') }}</div>
                    <select :value="friend.model_id" class="native-select" @change="updateFriendModel(index, $event)">
                      <option value="">{{ label('请选择模型', 'Select a model') }}</option>
                      <option v-for="model in store.state.models" :key="model.id" :value="model.id">
                        {{ model.name }} / {{ model.id }}
                      </option>
                      <option v-if="friend.model_id && !store.isModelAvailable(friend.model_id)" :value="friend.model_id">
                        {{ label('不可用模型', 'Unavailable model') }} / {{ friend.model_id }}
                      </option>
                    </select>
                  </label>
                  <div v-if="friend.model_id && !store.isModelAvailable(friend.model_id)" class="empty-note">
                    {{ label('这个 Friend 当前绑定的是一个已失效模型，重新选择后才能继续发起新的 AI 请求。', 'This friend points to an unavailable model. Pick a valid one before new AI requests can run.') }}
                  </div>
                  <div class="muted">{{ ui.t('memory_file') }}: {{ friend.memory_path }}</div>
                  <label>
                    <div class="section-title">{{ ui.t('soul') }}</div>
                    <textarea
                      :value="friend.soul"
                      class="native-textarea"
                      @input="updateFriendField(index, 'soul', readText($event))"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('system_prompt') }}</div>
                    <textarea
                      :value="friend.system_prompt"
                      class="native-textarea"
                      @input="updateFriendField(index, 'system_prompt', readText($event))"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('active') }}</div>
                    <input
                      :value="friend.active"
                      class="native-input"
                      max="1"
                      min="0"
                      step="0.05"
                      type="number"
                      @input="updateFriendNumber(index, 'active', $event)"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('ai_active') }}</div>
                    <input
                      :value="friend.ai_active"
                      class="native-input"
                      max="1"
                      min="0"
                      step="0.05"
                      type="number"
                      @input="updateFriendNumber(index, 'ai_active', $event)"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('latency') }}</div>
                    <input
                      :value="friend.latency"
                      class="native-input"
                      max="1"
                      min="0"
                      step="0.05"
                      type="number"
                      @input="updateFriendNumber(index, 'latency', $event)"
                      @blur="commitFriend(index)"
                    />
                  </label>
                  <ion-button color="danger" fill="clear" size="small" @click="handleRemoveFriend(index)">
                    {{ ui.t('remove') }}
                  </ion-button>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section v-else class="paper-sheet my-panel">
          <div class="my-panel__head">
            <div class="ink-label handwritten">{{ ui.t('data_desk') }}</div>
            <h2 class="ink-title">{{ ui.t('import_export') }}</h2>
          </div>

          <div class="paper-stack">
            <div class="row wrap">
              <ion-button :disabled="busy" @click="runAction(() => store.exportJsonSnapshot())">{{ ui.t('export_json') }}</ion-button>
              <ion-button fill="outline" :disabled="busy" @click="importInput?.click()">{{ ui.t('import_json') }}</ion-button>
              <ion-button fill="outline" :disabled="busy" @click="runAction(() => store.exportDiaryHtml())">
                {{ ui.t('export_diary') }}
              </ion-button>
              <ion-button fill="outline" :disabled="busy" @click="runAction(() => store.exportMailsHtml())">
                {{ ui.t('export_mails') }}
              </ion-button>
            </div>

            <input ref="importInput" hidden accept="application/json" type="file" @change="handleImport" />

            <div class="empty-note">
              {{ ui.t('events_count') }}: {{ store.sortedEvents.value.length }}<br />
              {{ ui.t('mails_count') }}: {{ store.sortedMails.value.length }}
            </div>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { resetAuthGateSkip } from '../auth/auth-gate';
import DiaryBookView from '../components/DiaryBookView.vue';
import { databaseService, getCapacitorPlatform, isNativePlatform, serverService } from '../services';
import { useAppStore } from '../store/app-store';
import { useUiPreferences, type PaperThemeId, type UiLocale } from '../ui/preferences';
import type { FriendRecord, MyPanel, SummaryInterval } from '../types/models';

interface FriendDraft extends FriendRecord {
  ui_key: string;
}

const router = useRouter();
const store = useAppStore();
const ui = useUiPreferences();

const importInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const authBusy = ref(false);
const authUsername = ref('');
const authPassword = ref('');
const friendDrafts = ref<FriendDraft[]>([]);

function label(zh: string, en: string): string {
  return ui.state.locale === 'zh-CN' ? zh : en;
}

function randomUiKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildFriendDrafts(friends: FriendRecord[]): FriendDraft[] {
  return friends.map((friend, index) => ({
    ...friend,
    ui_key: friendDrafts.value[index]?.ui_key ?? randomUiKey('friend'),
  }));
}

watch(
  () => JSON.stringify(store.state.friends),
  () => {
    friendDrafts.value = buildFriendDrafts(store.state.friends);
  },
  { immediate: true },
);

const panels = computed<Array<{ key: MyPanel; label: string }>>(() => [
  { key: 'mailbox', label: ui.t('mailbox') },
  { key: 'diary', label: ui.t('diary') },
  { key: 'setting', label: ui.t('setting') },
  { key: 'data', label: ui.t('data') },
]);

const platformLabel = computed(() => {
  const platform = getCapacitorPlatform();
  return `${platform} (${ui.t(isNativePlatform() ? 'native_runtime' : 'web_runtime')})`;
});

const diaryFontOptions = computed(() => {
  const zh = ui.state.locale === 'zh-CN';
  return [
    { value: 0.9, label: zh ? '偏小 90%' : 'Smaller 90%' },
    { value: 1, label: zh ? '默认 100%' : 'Default 100%' },
    { value: 1.1, label: zh ? '偏大 110%' : 'Larger 110%' },
    { value: 1.2, label: zh ? '更大 120%' : 'Largest 120%' },
  ];
});

const isAuthenticated = computed(() => store.hasActiveSession());
const serverConfigured = computed(() => serverService.isConfigured());
const serverBaseUrl = computed(() => serverService.getBaseUrl());
const canRefreshModels = computed(() => serverConfigured.value && isAuthenticated.value);
const canUseAi = computed(() => serverConfigured.value && isAuthenticated.value && store.state.models.length > 0);

function readText(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return target?.value ?? '';
}

function readChecked(event: Event): boolean {
  const target = event.target as HTMLInputElement | null;
  return Boolean(target?.checked);
}

function readNumber(event: Event): number {
  const value = Number(readText(event));
  return Number.isFinite(value) ? value : 0;
}

function handlePreAlertChange(event: Event): void {
  void store.updateConfig({ pre_alert: readNumber(event) });
}

function handleAlertTimeChange(event: Event): void {
  void store.updateConfig({ alert_time: readText(event) });
}

function handleDiaryPaperSizeChange(event: Event): void {
  const diaryPaperSize = readText(event);
  if (diaryPaperSize === 'B5' || diaryPaperSize === 'B6') {
    void store.updateConfig({ diary_paper_size: diaryPaperSize });
  }
}

function handleDiaryFontScaleChange(event: Event): void {
  const diaryFontScale = readNumber(event);
  if (diaryFontScale > 0) {
    void store.updateConfig({ diary_font_scale: diaryFontScale });
  }
}

function updateFriendField(index: number, field: 'name' | 'id' | 'soul' | 'system_prompt', value: string): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  draft[field] = value;
}

function updateFriendNumber(index: number, field: 'active' | 'ai_active' | 'latency', event: Event): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  draft[field] = readNumber(event);
}

function updateFriendEnabled(index: number, event: Event): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  draft.enabled = readChecked(event);
  commitFriend(index);
}

function updateFriendModel(index: number, event: Event): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  draft.model_id = readText(event);
  commitFriend(index);
}

function commitFriend(index: number): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  void store.updateFriend(index, {
    enabled: draft.enabled,
    name: draft.name,
    id: draft.id,
    model_id: draft.model_id,
    soul: draft.soul,
    system_prompt: draft.system_prompt,
    active: draft.active,
    ai_active: draft.ai_active,
    latency: draft.latency,
  });
}

function handleAddFriend(): void {
  store.addFriend();
}

function handleRemoveFriend(index: number): void {
  const target = store.state.friends[index];
  if (!target) {
    return;
  }

  store.removeFriend(target.id);
}

function handleLocaleChange(event: Event): void {
  const locale = readText(event) as UiLocale;
  if (locale === 'zh-CN' || locale === 'en') {
    void ui.setLocale(locale);
  }
}

function handlePaperThemeChange(event: Event): void {
  const theme = readText(event) as PaperThemeId;
  if (theme === 'plain-paper' || theme === 'warm-scrapbook' || theme === 'ink-studio') {
    void ui.setPaperTheme(theme);
  }
}

function openMail(id: string): void {
  router.push(`/mail/${id}`);
}

async function generateSummary(interval: SummaryInterval): Promise<void> {
  if (!canUseAi.value) {
    window.alert(label('请先登录并刷新模型列表。', 'Please sign in and refresh models first.'));
    return;
  }

  await store.regenerateSummary(interval);
}

async function handleAuth(mode: 'signin' | 'signup'): Promise<void> {
  authBusy.value = true;
  try {
    if (mode === 'signin') {
      await store.signin(authUsername.value, authPassword.value);
    } else {
      await store.signup(authUsername.value, authPassword.value);
    }
    authPassword.value = '';
  } catch (error) {
    window.alert(error instanceof Error ? error.message : label('认证失败', 'Authentication failed'));
  } finally {
    authBusy.value = false;
  }
}

async function handleSignout(): Promise<void> {
  authBusy.value = true;
  try {
    await store.signout();
    resetAuthGateSkip();
    await router.replace('/auth');
  } catch (error) {
    window.alert(error instanceof Error ? error.message : label('退出失败', 'Sign out failed'));
  } finally {
    authBusy.value = false;
  }
}

async function handleRefreshModels(): Promise<void> {
  authBusy.value = true;
  try {
    await store.refreshModels();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : label('刷新模型失败', 'Failed to refresh models'));
  } finally {
    authBusy.value = false;
  }
}

async function runAction(task: () => Promise<void>): Promise<void> {
  busy.value = true;
  try {
    await task();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : ui.t('data_desk'));
  } finally {
    busy.value = false;
  }
}

async function handleImport(domEvent: Event): Promise<void> {
  const input = domEvent.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  busy.value = true;
  try {
    await store.importJsonSnapshot(await file.text());
  } catch (error) {
    window.alert(error instanceof Error ? error.message : ui.t('import_json'));
  } finally {
    if (input) {
      input.value = '';
    }
    busy.value = false;
  }
}
</script>

<style scoped>
.my-switcher {
  padding: 24px;
}

.my-switcher__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
}

.my-panel {
  padding: 24px;
}

.my-panel__head {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.my-mail-item {
  --background: rgba(255, 251, 243, 0.66);
  margin-bottom: 10px;
}

.my-config-card {
  padding: 16px;
  transform: none;
}

.my-debug-note {
  margin-top: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}

.my-diary-panel {
  display: grid;
  gap: 18px;
}
</style>
