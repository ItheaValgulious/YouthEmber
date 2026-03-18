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
            <ion-card-subtitle>对应 plan 里的 Mailbox / Diary / Setting / Data。</ion-card-subtitle>
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
              <ion-card-subtitle>Summary 会以 Mail 的形式渲染。</ion-card-subtitle>
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
              <ion-card-subtitle>当前先按自然日聚合为单栏“书页式”预览。</ion-card-subtitle>
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
                Diary 还没有内容，先创建几条 Event 或 Task。
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section v-else-if="store.state.last_opened_my_panel === 'setting'" class="card-stack">
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
                <ion-button fill="outline" size="small" @click="store.addModel()">新增</ion-button>
              </div>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div
                v-for="model in store.state.models"
                :key="model.id"
                class="preview-card"
                style="padding: 12px;"
              >
                <div class="card-stack">
                  <input v-model="model.name" class="native-input" placeholder="name" />
                  <input v-model="model.id" class="native-input" placeholder="id" />
                  <input v-model="model.base_url" class="native-input" placeholder="base_url" />
                  <input v-model="model.api_key" class="native-input" placeholder="api_key" />
                  <ion-button color="danger" fill="clear" size="small" @click="store.removeModel(model.id)">
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
                <ion-button fill="outline" size="small" @click="store.addFriend()">新增</ion-button>
              </div>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <div
                v-for="friend in store.state.friends"
                :key="friend.id"
                class="preview-card"
                style="padding: 12px;"
              >
                <div class="card-stack">
                  <label class="row between">
                    <strong>启用</strong>
                    <input v-model="friend.enabled" type="checkbox" />
                  </label>
                  <input v-model="friend.name" class="native-input" placeholder="name" />
                  <input v-model="friend.id" class="native-input" placeholder="id" />
                  <select v-model="friend.model_id" class="native-select">
                    <option v-for="model in store.state.models" :key="model.id" :value="model.id">
                      {{ model.name }} · {{ model.id }}
                    </option>
                  </select>
                  <textarea v-model="friend.soul" class="native-textarea" placeholder="soul" />
                  <textarea v-model="friend.system_prompt" class="native-textarea" placeholder="system_prompt" />
                  <label>
                    <div class="section-title">active</div>
                    <input v-model.number="friend.active" class="native-input" max="1" min="0" step="0.05" type="number" />
                  </label>
                  <label>
                    <div class="section-title">latency</div>
                    <input
                      v-model.number="friend.latency"
                      class="native-input"
                      max="1"
                      min="0"
                      step="0.05"
                      type="number"
                    />
                  </label>
                  <ion-button color="danger" fill="clear" size="small" @click="store.removeFriend(friend.id)">
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
              <ion-card-subtitle>当前支持本地 Json/HTML 导入导出。</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content class="card-stack">
              <ion-button @click="store.exportJsonSnapshot()">Export Json</ion-button>
              <ion-button fill="outline" @click="importInput?.click()">Import Json</ion-button>
              <ion-button fill="outline" @click="store.exportDiaryHtml()">Export Diary</ion-button>
              <ion-button fill="outline" @click="store.exportMailsHtml()">Export Mails</ion-button>
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { useAppStore } from '../store/app-store';
import type { MyPanel, SummaryInterval } from '../types/models';

const router = useRouter();
const store = useAppStore();
const importInput = ref<HTMLInputElement | null>(null);

const panels: Array<{ key: MyPanel; label: string }> = [
  { key: 'mailbox', label: 'Mailbox' },
  { key: 'diary', label: 'Diary Page' },
  { key: 'setting', label: 'Setting' },
  { key: 'data', label: 'Data' },
];

function openMail(id: string): void {
  router.push(`/mail/${id}`);
}

function generateSummary(interval: SummaryInterval): void {
  store.regenerateSummary(interval);
}

async function handleImport(domEvent: Event): Promise<void> {
  const input = domEvent.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  try {
    store.importJsonSnapshot(await file.text());
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '导入失败');
  } finally {
    input.value = '';
  }
}
</script>
