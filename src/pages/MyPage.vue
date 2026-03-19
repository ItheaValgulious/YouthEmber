<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>My</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap card-stack">
        <ion-card class="sketch-card">
          <ion-card-header>
            <ion-card-title>入口</ion-card-title>
          </ion-card-header>
          <ion-card-content>
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
          </ion-card-content>
        </ion-card>

        <section v-if="store.state.last_opened_my_panel === 'mailbox'" class="card-stack">
          <ion-card class="sketch-card">
            <ion-card-header>
              <ion-card-title>Mailbox</ion-card-title>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div class="row wrap">
                <ion-button fill="outline" @click="generateSummary('7d')">生成 7d</ion-button>
                <ion-button fill="outline" @click="generateSummary('3m')">生成 3m</ion-button>
                <ion-button fill="outline" @click="generateSummary('1y')">生成 1y</ion-button>
              </div>

              <ion-item
                v-for="mail in store.sortedMails.value"
                :key="mail.id"
                button
                detail
                class="mail-list-button"
                @click="openMail(mail.id)"
              >
                <ion-label>
                  <h2>{{ mail.title }}</h2>
                  <p>{{ store.formatDateTime(mail.time) }} · {{ mail.sender }}</p>
                </ion-label>
              </ion-item>

              <div v-if="!store.sortedMails.value.length" class="empty-note">
                还没有 Mail，先生成一封 Summary 试试。
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section v-else-if="store.state.last_opened_my_panel === 'diary'" class="card-stack">
          <ion-card class="sketch-card">
            <ion-card-header>
              <ion-card-title>Diary</ion-card-title>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div v-for="group in store.diaryGroups.value" :key="group.date" class="preview-card" style="padding: 12px;">
                <div class="section-title">{{ group.date }}</div>
                <div class="card-stack">
                  <div
                    v-for="event in group.events"
                    :key="event.id"
                    style="padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid #ddc4a0;"
                  >
                    <strong>{{ event.title || '未命名记录' }}</strong>
                    <div class="muted" style="margin-top: 4px;">
                      {{ store.formatDateTime(store.effectiveTimeOf(event)) }}
                    </div>
                    <div style="margin-top: 8px; line-height: 1.6; white-space: pre-wrap;">
                      {{ event.raw || '（无正文）' }}
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!store.diaryGroups.value.length" class="empty-note">
                Diary 还没有内容。
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section v-else-if="store.state.last_opened_my_panel === 'setting'" class="card-stack">
          <ion-card class="sketch-card">
            <ion-card-header>
              <ion-card-title>Runtime</ion-card-title>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div class="empty-note">
                当前平台：{{ platformLabel }}<br />
                存储驱动：{{ databaseService.driverLabel }}
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="sketch-card">
            <ion-card-header>
              <ion-card-title>Config</ion-card-title>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <label>
                <div class="section-title">Timezone</div>
                <input v-model="store.state.config.timezone" class="native-input" />
              </label>
              <label>
                <div class="section-title">Pre Alert</div>
                <input v-model.number="store.state.config.pre_alert" class="native-input" min="0" step="1" type="number" />
              </label>
              <label>
                <div class="section-title">Alert Time</div>
                <input v-model="store.state.config.alert_time" class="native-input" type="time" />
              </label>
            </ion-card-content>
          </ion-card>

          <ion-card class="sketch-card">
            <ion-card-header>
              <div class="row between">
                <ion-card-title>Models</ion-card-title>
                <ion-button fill="outline" size="small" @click="handleAddModel">新增</ion-button>
              </div>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div class="empty-note">
                标题、tag、Summary、tag arrange 默认使用列表中的首个可用模型；`id` 会直接作为请求里的 model 标识。
              </div>

              <div
                v-for="(model, index) in modelDrafts"
                :key="model.ui_key"
                class="preview-card"
                style="padding: 12px;"
              >
                <div class="card-stack">
                  <input
                    :value="model.name"
                    class="native-input"
                    placeholder="name"
                    @input="updateModelField(index, 'name', readText($event))"
                    @blur="commitModel(index)"
                  />
                  <input
                    :value="model.id"
                    class="native-input"
                    placeholder="id"
                    @input="updateModelField(index, 'id', readText($event))"
                    @blur="commitModel(index)"
                  />
                  <input
                    :value="model.base_url"
                    class="native-input"
                    placeholder="base_url"
                    @input="updateModelField(index, 'base_url', readText($event))"
                    @blur="commitModel(index)"
                  />
                  <input
                    :value="model.api_key"
                    class="native-input"
                    placeholder="api_key"
                    @input="updateModelField(index, 'api_key', readText($event))"
                    @blur="commitModel(index)"
                  />
                  <ion-button color="danger" fill="clear" size="small" @click="handleRemoveModel(index)">
                    删除
                  </ion-button>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <ion-card class="sketch-card">
            <ion-card-header>
              <div class="row between">
                <ion-card-title>Friends</ion-card-title>
                <ion-button fill="outline" size="small" @click="handleAddFriend">新增</ion-button>
              </div>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div
                v-for="(friend, index) in friendDrafts"
                :key="friend.ui_key"
                class="preview-card"
                style="padding: 12px;"
              >
                <div class="card-stack">
                  <label class="row between">
                    <strong>启用</strong>
                    <input :checked="friend.enabled" type="checkbox" @change="updateFriendEnabled(index, $event)" />
                  </label>
                  <input
                    :value="friend.name"
                    class="native-input"
                    placeholder="name"
                    @input="updateFriendField(index, 'name', readText($event))"
                    @blur="commitFriend(index)"
                  />
                  <input
                    :value="friend.id"
                    class="native-input"
                    placeholder="id"
                    @input="updateFriendField(index, 'id', readText($event))"
                    @blur="commitFriend(index)"
                  />
                  <select
                    :value="friend.model_id"
                    class="native-select"
                    @change="updateFriendModel(index, $event)"
                  >
                    <option v-for="model in store.state.models" :key="model.id" :value="model.id">
                      {{ model.name }} · {{ model.id }}
                    </option>
                  </select>
                  <textarea
                    :value="friend.soul"
                    class="native-textarea"
                    placeholder="soul"
                    @input="updateFriendField(index, 'soul', readText($event))"
                    @blur="commitFriend(index)"
                  />
                  <textarea
                    :value="friend.system_prompt"
                    class="native-textarea"
                    placeholder="system_prompt"
                    @input="updateFriendField(index, 'system_prompt', readText($event))"
                    @blur="commitFriend(index)"
                  />
                  <label>
                    <div class="section-title">active</div>
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
                    <div class="section-title">latency</div>
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
                    删除
                  </ion-button>
                </div>
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section v-else class="card-stack">
          <ion-card class="sketch-card">
            <ion-card-header>
              <ion-card-title>Data</ion-card-title>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <ion-button :disabled="busy" @click="runAction(() => store.exportJsonSnapshot())">Export Json</ion-button>
              <ion-button fill="outline" :disabled="busy" @click="importInput?.click()">Import Json</ion-button>
              <ion-button fill="outline" :disabled="busy" @click="runAction(() => store.exportDiaryHtml())">Export Diary</ion-button>
              <ion-button fill="outline" :disabled="busy" @click="runAction(() => store.exportMailsHtml())">Export Mails</ion-button>
              <input ref="importInput" hidden accept="application/json" type="file" @change="handleImport" />

              <div class="empty-note">
                当前本地共有 {{ store.sortedEvents.value.length }} 条 Event、{{ store.sortedMails.value.length }} 封 Mail。
              </div>
            </ion-card-content>
          </ion-card>
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
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { databaseService, getCapacitorPlatform, isNativePlatform } from '../services';
import { useAppStore } from '../store/app-store';
import type { FriendRecord, ModelRecord, MyPanel, SummaryInterval } from '../types/models';

interface ModelDraft extends ModelRecord {
  ui_key: string;
}

interface FriendDraft extends FriendRecord {
  ui_key: string;
}

const router = useRouter();
const store = useAppStore();
const importInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const modelDrafts = ref<ModelDraft[]>([]);
const friendDrafts = ref<FriendDraft[]>([]);

const panels: Array<{ key: MyPanel; label: string }> = [
  { key: 'mailbox', label: 'Mailbox' },
  { key: 'diary', label: 'Diary Page' },
  { key: 'setting', label: 'Setting' },
  { key: 'data', label: 'Data' },
];

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

const platformLabel = computed(() => {
  const platform = getCapacitorPlatform();
  return isNativePlatform() ? `${platform}（Native）` : `${platform}（Web fallback）`;
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

function updateModelField(index: number, field: keyof ModelRecord, value: string): void {
  const draft = modelDrafts.value[index];
  if (!draft) {
    return;
  }

  draft[field] = value;
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
}

function updateFriendField(index: number, field: 'name' | 'id' | 'soul' | 'system_prompt', value: string): void {
  const draft = friendDrafts.value[index];
  if (!draft) {
    return;
  }

  draft[field] = value;
}

function updateFriendNumber(index: number, field: 'active' | 'latency', event: Event): void {
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
    window.alert(error instanceof Error ? error.message : '操作失败');
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
    window.alert(error instanceof Error ? error.message : '导入失败');
  } finally {
    if (input) {
      input.value = '';
    }
    busy.value = false;
  }
}
</script>
