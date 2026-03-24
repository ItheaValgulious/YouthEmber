<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/flow" />
        </ion-buttons>
        <ion-title>{{ ui.t('detail') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap desk-stack">
        <template v-if="event">
          <section class="paper-sheet detail-sheet">
            <div class="detail-sheet__head row between wrap">
              <div class="detail-sheet__title-block">
                <div class="handwritten detail-sheet__time">{{ store.formatDateTime(store.effectiveTimeOf(event)) }}</div>
                <h1 class="ink-title detail-sheet__title">{{ displayTitle }}</h1>
              </div>

              <div class="tag-row">
                <span
                  v-for="tag in store.sortDisplayTags(event.tags)"
                  :key="`${tag.type}-${tag.label}`"
                  class="tag-chip"
                >
                  {{ tag.label }}
                </span>
              </div>
            </div>

            <div class="detail-sheet__body">
              <div class="detail-sheet__entry">
                <p v-if="event.raw" class="detail-sheet__text">{{ event.raw }}</p>
                <p
                  v-else-if="!event.assets.length && !event.comments.length"
                  class="detail-sheet__text muted"
                >
                  {{ ui.t('title_only_friendly') }}
                </p>

                <div v-if="event.assets.length" class="preview-grid detail-sheet__assets">
                  <div v-for="asset in event.assets" :key="asset.id" class="preview-card">
                    <img v-if="asset.type === 'image'" :src="asset.display_path || asset.filepath" :alt="asset.filename || 'asset'" />
                    <video
                      v-else-if="asset.type === 'video'"
                      :poster="asset.thumbnail_path"
                      :src="asset.display_path || asset.filepath"
                      controls
                    />
                    <div v-else class="preview-meta">
                      {{ ui.t('audio') }} / {{ asset.mime_type || ui.t('audio') }}
                      <div v-if="asset.duration_ms">{{ Math.round(asset.duration_ms / 1000) }}s</div>
                    </div>
                    <div class="preview-meta">
                      {{ asset.filename || asset.type }}
                    </div>
                  </div>
                </div>
              </div>

              <aside v-if="store.isOngoingTask(event)" class="detail-sheet__task paper-slip">
                <div class="section-title">{{ ui.t('task_controls') }}</div>
                <label>
                  <div class="section-title">{{ ui.t('due_time') }}</div>
                  <input v-model="taskDueDraft" class="native-input" type="datetime-local" />
                </label>
                <div class="row wrap">
                  <ion-button fill="outline" @click="saveTaskDueTime">{{ ui.t('save_due_time') }}</ion-button>
                  <ion-button fill="clear" @click="clearTaskDueTime">{{ ui.t('clear_due_time') }}</ion-button>
                </div>
                <div class="row wrap">
                  <ion-button color="success" @click="store.completeTask(event.id)">{{ ui.t('complete') }}</ion-button>
                  <ion-button color="danger" fill="outline" @click="store.failTask(event.id)">{{ ui.t('fail') }}</ion-button>
                </div>
              </aside>
            </div>
          </section>

          <section class="paper-sheet detail-comments">
            <div class="detail-comments__head row between wrap">
              <div>
                <div class="ink-label handwritten">{{ ui.t('margin_notes') }}</div>
                <h2 class="ink-title">{{ ui.t('comments') }}</h2>
              </div>

              <select v-model="commentOrder" class="native-select detail-comments__select">
                <option value="desc">{{ ui.t('newest_first') }}</option>
                <option value="asc">{{ ui.t('oldest_first') }}</option>
              </select>
            </div>

            <div v-if="orderedComments.length" class="detail-comments__list">
              <article
                v-for="comment in orderedComments"
                :key="comment.id"
                class="paper-annotation detail-comments__item"
              >
                <div class="detail-comments__meta">
                  <span class="handwritten">{{ store.friendName(comment.sender) }}</span>
                  <span class="muted">{{ store.formatDateTime(comment.time) }}</span>
                </div>
                <p>{{ comment.content }}</p>
              </article>
            </div>
            <div v-else class="empty-note">{{ ui.t('no_comments_yet') }}</div>

            <div class="detail-comments__composer paper-note">
              <div class="section-title">{{ ui.t('add_note') }}</div>
              <textarea v-model="commentDraft" class="native-textarea" :placeholder="ui.t('comment_placeholder')" />
              <ion-button @click="submitComment">{{ ui.t('post_comment') }}</ion-button>
            </div>
          </section>
        </template>

        <div v-else class="empty-note">
          {{ ui.t('event_not_found') }}
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../lib/date';
import { databaseService } from '../services';
import { useAppStore } from '../store/app-store';
import { useUiPreferences } from '../ui/preferences';

const COMMENT_SORT_KEY = 'ui.comment.sort';

const route = useRoute();
const store = useAppStore();
const ui = useUiPreferences();
const commentDraft = ref('');
const commentOrder = ref<'desc' | 'asc'>('desc');
const taskDueDraft = ref('');

onMounted(async () => {
  const saved = await databaseService.getJson<'desc' | 'asc'>(COMMENT_SORT_KEY);
  if (saved === 'asc' || saved === 'desc') {
    commentOrder.value = saved;
  }
});

watch(commentOrder, (value) => {
  void databaseService.setJson(COMMENT_SORT_KEY, value);
});

const event = computed(() => store.getEventById(String(route.params.id)));

watch(
  event,
  (value) => {
    taskDueDraft.value = toDateTimeLocalValue(value?.time);
  },
  { immediate: true },
);

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

const displayTitle = computed(() => {
  const target = event.value;
  if (!target) {
    return '';
  }

  if (target.title.trim()) {
    return target.title;
  }

  return ui.state.locale === 'zh-CN' ? '书写中' : 'Writing';
});

async function submitComment(): Promise<void> {
  const target = event.value;
  if (!target || !commentDraft.value.trim()) {
    return;
  }

  await store.addComment(target.id, commentDraft.value);
  commentDraft.value = '';
}

function saveTaskDueTime(): void {
  const target = event.value;
  if (!target || !store.isOngoingTask(target)) {
    return;
  }

  store.updateTaskDueTime(target.id, fromDateTimeLocalValue(taskDueDraft.value));
}

function clearTaskDueTime(): void {
  const target = event.value;
  if (!target || !store.isOngoingTask(target)) {
    return;
  }

  taskDueDraft.value = '';
  store.updateTaskDueTime(target.id, null);
}
</script>

<style scoped>
.detail-sheet,
.detail-comments {
  padding: 24px;
}

.detail-sheet__head,
.detail-comments__head {
  align-items: start;
  gap: 18px;
}

.detail-sheet__title-block {
  display: grid;
  gap: 8px;
}

.detail-sheet__time {
  color: #836447;
  font-size: 1rem;
}

.detail-sheet__title {
  max-width: 720px;
}

.detail-sheet__body {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.85fr);
  margin-top: 22px;
}

.detail-sheet__entry {
  padding: 0;
}

.detail-sheet__text {
  margin: 0;
  line-height: 1.82;
  white-space: pre-wrap;
}

.detail-sheet__assets {
  margin-top: 18px;
}

.detail-sheet__task {
  display: grid;
  gap: 14px;
  align-content: start;
}

.detail-comments__select {
  width: auto;
  min-width: 150px;
}

.detail-comments__list {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-top: 18px;
}

.detail-comments__item:nth-child(odd) {
  transform: rotate(-1.8deg);
}

.detail-comments__item:nth-child(even) {
  transform: rotate(1.5deg) translateY(6px);
}

.detail-comments__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 12px;
}

.detail-comments__item p {
  margin: 0;
  line-height: 1.68;
}

.detail-comments__composer {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

@media (max-width: 860px) {
  .detail-sheet__body {
    grid-template-columns: 1fr;
  }
}
</style>
