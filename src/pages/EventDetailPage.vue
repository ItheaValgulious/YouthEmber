<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/flow" />
        </ion-buttons>
        <ion-title>Detail</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap">
        <ion-card v-if="event" class="sketch-card">
          <ion-card-header>
            <ion-card-title>{{ event.title || 'AI 正在补标题…' }}</ion-card-title>
            <ion-card-subtitle>{{ store.formatDateTime(store.effectiveTimeOf(event)) }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="card-stack">
            <div class="tag-row">
              <span
                v-for="tag in store.sortDisplayTags(event.tags)"
                :key="`${tag.type}-${tag.label}`"
                class="tag-chip"
              >
                {{ tag.label }}
              </span>
            </div>

            <div style="line-height: 1.75; white-space: pre-wrap;">{{ event.raw || '（无正文）' }}</div>

            <div v-if="event.assets.length" class="preview-grid">
              <div v-for="asset in event.assets" :key="asset.id" class="preview-card">
                <img v-if="asset.type === 'image'" :src="asset.filepath" alt="asset" />
                <video v-else-if="asset.type === 'video'" :src="asset.filepath" controls />
                <div v-else class="preview-meta">🎵 {{ asset.mime_type || 'audio' }}</div>
                <div class="preview-meta">{{ asset.type }}</div>
              </div>
            </div>

            <div v-if="store.isOngoingTask(event)" class="row wrap">
              <ion-button color="success" @click="store.completeTask(event.id)">完成</ion-button>
              <ion-button color="danger" fill="outline" @click="store.failTask(event.id)">放弃</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="event" class="sketch-card" style="margin-top: 14px;">
          <ion-card-header>
            <div class="row between">
              <ion-card-title>Comments</ion-card-title>
              <select v-model="commentOrder" class="native-select" style="max-width: 160px;">
                <option value="desc">新到旧</option>
                <option value="asc">旧到新</option>
              </select>
            </div>
          </ion-card-header>
          <ion-card-content class="card-stack">
            <div
              v-for="comment in orderedComments"
              :key="comment.id"
              style="padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid #ddc4a0;"
            >
              <div class="row between wrap">
                <strong>{{ store.friendName(comment.sender) }}</strong>
                <span class="muted">{{ store.formatDateTime(comment.time) }}</span>
              </div>
              <div style="margin-top: 8px; line-height: 1.7;">{{ comment.content }}</div>
            </div>

            <div class="card-stack">
              <textarea v-model="commentDraft" class="native-textarea" placeholder="追加一条评论…" />
              <ion-button @click="submitComment">发送评论</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <div v-else class="empty-note">
          没找到这条 Event，它可能已经被导入数据覆盖了。
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { useAppStore } from '../store/app-store';

const COMMENT_SORT_KEY = 'ashdairy.comment.sort';

const route = useRoute();
const store = useAppStore();
const commentDraft = ref('');
const commentOrder = ref<'desc' | 'asc'>(
  localStorage.getItem(COMMENT_SORT_KEY) === 'asc' ? 'asc' : 'desc',
);

watch(commentOrder, (value) => {
  localStorage.setItem(COMMENT_SORT_KEY, value);
});

const event = computed(() => store.getEventById(String(route.params.id)));
const orderedComments = computed(() => {
  const target = event.value;
  if (!target) {
    return [];
  }

  const list = [...target.comments];
  list.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
  if (commentOrder.value === 'desc') {
    list.reverse();
  }
  return list;
});

function submitComment(): void {
  const target = event.value;
  if (!target || !commentDraft.value.trim()) {
    return;
  }

  store.addComment(target.id, commentDraft.value);
  commentDraft.value = '';
}
</script>
