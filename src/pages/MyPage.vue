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
              <ion-button fill="outline" @click="generateSummary('7d')">
                {{ ui.t('summary_interval_label', { interval: '7d' }) }}
              </ion-button>
              <ion-button fill="outline" @click="generateSummary('3m')">
                {{ ui.t('summary_interval_label', { interval: '3m' }) }}
              </ion-button>
              <ion-button fill="outline" @click="generateSummary('1y')">
                {{ ui.t('summary_interval_label', { interval: '1y' }) }}
              </ion-button>
            </div>
          </div>

          <div class="paper-stack">
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
              {{ ui.t('storage') }}: {{ databaseService.driverLabel }}
            </div>
            <div v-if="store.latestAiFailure.value" class="empty-note my-debug-note">
              AI job: {{ store.latestAiFailure.value.type }}<br />
              Error: {{ store.latestAiFailure.value.last_error }}
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
                <input v-model.number="store.state.config.pre_alert" class="native-input" min="0" step="1" type="number" />
              </label>
              <label>
                <div class="section-title">{{ ui.t('alert_time') }}</div>
                <input v-model="store.state.config.alert_time" class="native-input" type="time" />
              </label>
              <label>
                <div class="section-title">{{ ui.t('token') }}</div>
                <input v-model="store.state.token" class="native-input" :placeholder="ui.t('future_sync_token')" />
              </label>
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
                <select v-model="store.state.config.diary_paper_size" class="native-select">
                  <option value="B5">{{ ui.t('b5_paper') }}</option>
                  <option value="B6">{{ ui.state.locale === 'zh-CN' ? 'B6 竖版' : 'B6 portrait' }}</option>
                </select>
              </label>
              <label>
                <div class="section-title">{{ ui.state.locale === 'zh-CN' ? '日记字号' : 'Diary font size' }}</div>
                <select v-model.number="store.state.config.diary_font_scale" class="native-select">
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
                <div class="ink-label handwritten">{{ ui.t('model_list') }}</div>
                <h2 class="ink-title">{{ ui.t('model_list') }}</h2>
              </div>
              <ion-button fill="outline" size="small" @click="handleAddModel">{{ ui.t('add_model') }}</ion-button>
            </div>

            <div class="paper-stack">
              <div class="empty-note">{{ ui.t('model_hint') }}</div>

              <div v-for="(model, index) in modelDrafts" :key="model.ui_key" class="preview-card my-config-card">
                <div class="paper-stack">
                  <label>
                    <div class="section-title">{{ ui.t('name') }}</div>
                    <input
                      :value="model.name"
                      class="native-input"
                      :placeholder="ui.t('model_name_placeholder')"
                      @input="updateModelField(index, 'name', readText($event))"
                      @blur="commitModel(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('identifier') }}</div>
                    <input
                      :value="model.id"
                      class="native-input"
                      :placeholder="ui.t('model_id_placeholder')"
                      @input="updateModelField(index, 'id', readText($event))"
                      @blur="commitModel(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('base_url') }}</div>
                    <input
                      :value="model.base_url"
                      class="native-input"
                      :placeholder="ui.t('base_url_placeholder')"
                      @input="updateModelField(index, 'base_url', readText($event))"
                      @blur="commitModel(index)"
                    />
                  </label>
                  <label>
                    <div class="section-title">{{ ui.t('api_key') }}</div>
                    <input
                      :value="model.api_key"
                      class="native-input"
                      :placeholder="ui.t('api_key_placeholder')"
                      @input="updateModelField(index, 'api_key', readText($event))"
                      @blur="commitModel(index)"
                    />
                  </label>
                  <label class="row between">
                    <strong>{{ ui.t('img_dealing') }}</strong>
                    <input :checked="model.img_dealing" type="checkbox" @change="updateModelImageDealing(index, $event)" />
                  </label>
                  <ion-button color="danger" fill="clear" size="small" @click="handleRemoveModel(index)">
                    {{ ui.t('remove') }}
                  </ion-button>
                </div>
              </div>
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
                    <div class="section-title">{{ ui.t('model_list') }}</div>
                    <select :value="friend.model_id" class="native-select" @change="updateFriendModel(index, $event)">
                      <option v-for="model in store.state.models" :key="model.id" :value="model.id">
                        {{ model.name }} / {{ model.id }}
                      </option>
                    </select>
                  </label>
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

import DiaryBookView from '../components/DiaryBookView.vue';
import { databaseService, getCapacitorPlatform, isNativePlatform } from '../services';
import { useAppStore } from '../store/app-store';
import { useUiPreferences, type PaperThemeId, type UiLocale } from '../ui/preferences';
import type { FriendRecord, ModelRecord, MyPanel, SummaryInterval } from '../types/models';

interface ModelDraft extends ModelRecord {
  ui_key: string;
}

interface FriendDraft extends FriendRecord {
  ui_key: string;
}

const router = useRouter();
const store = useAppStore();
const ui = useUiPreferences();

const importInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const modelDrafts = ref<ModelDraft[]>([]);
const friendDrafts = ref<FriendDraft[]>([]);

function randomUiKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildModelDrafts(models: ModelRecord[]): ModelDraft[] {
  return models.map((model, index) => ({
    ...model,
    ui_key: modelDrafts.value[index]?.ui_key ?? randomUiKey('model'),
  }));
}

function buildFriendDrafts(friends: FriendRecord[]): FriendDraft[] {
  return friends.map((friend, index) => ({
    ...friend,
    ui_key: friendDrafts.value[index]?.ui_key ?? randomUiKey('friend'),
  }));
}

watch(
  () => JSON.stringify(store.state.models),
  () => {
    modelDrafts.value = buildModelDrafts(store.state.models);
  },
  { immediate: true },
);

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

function updateModelField(index: number, field: 'name' | 'id' | 'base_url' | 'api_key', value: string): void {
  const draft = modelDrafts.value[index];
  if (!draft) {
    return;
  }

  draft[field] = value;
}

function updateModelImageDealing(index: number, event: Event): void {
  const draft = modelDrafts.value[index];
  if (!draft) {
    return;
  }

  draft.img_dealing = readChecked(event);
  commitModel(index);
}

function commitModel(index: number): void {
  const draft = modelDrafts.value[index];
  const target = store.state.models[index];
  if (!draft || !target) {
    return;
  }

  target.name = draft.name.trim();
  target.id = draft.id.trim();
  target.base_url = draft.base_url.trim();
  target.api_key = draft.api_key.trim();
  target.img_dealing = draft.img_dealing;
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
  const target = store.state.friends[index];
  if (!draft || !target) {
    return;
  }

  target.enabled = draft.enabled;
  target.name = draft.name.trim();
  target.id = draft.id.trim();
  target.model_id = draft.model_id.trim();
  target.soul = draft.soul.trim();
  target.system_prompt = draft.system_prompt.trim();
  target.active = draft.active;
  target.ai_active = draft.ai_active;
  target.latency = draft.latency;
}

function handleAddModel(): void {
  store.addModel();
}

function handleRemoveModel(index: number): void {
  const target = store.state.models[index];
  if (!target) {
    return;
  }

  store.removeModel(target.id);
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

function generateSummary(interval: SummaryInterval): void {
  store.regenerateSummary(interval);
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
