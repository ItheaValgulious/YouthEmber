<template>
  <article class="event-paper" :class="{ 'is-task': ongoing }">
    <div
      class="event-paper__surface"
      role="button"
      tabindex="0"
      @click="openDetail"
      @keydown.enter.prevent="openDetail"
      @keydown.space.prevent="openDetail"
    >
      <div class="event-paper__top row between wrap">
        <div class="event-paper__title-block">
          <div class="handwritten event-paper__time">{{ formattedTime }}</div>
          <h3 class="event-paper__title">{{ displayTitle }}</h3>
        </div>

        <span v-if="statusLabel" class="event-paper__stamp">
          {{ statusLabel }}
        </span>
      </div>

      <div v-if="displayTags.length" class="tag-row event-paper__tags">
        <span v-for="tag in displayTags" :key="`${tag.type}-${tag.label}`" class="tag-chip">
          {{ tag.label }}
        </span>
      </div>

      <p v-if="excerpt" class="event-paper__excerpt">{{ excerpt }}</p>

      <div v-if="imageAssets.length" class="event-paper__photos">
        <figure v-for="asset in imageAssets" :key="asset.id" class="event-paper__photo">
          <img :src="asset.display_path || asset.filepath" :alt="asset.mime_type || asset.type" />
        </figure>
      </div>

      <div v-if="otherAssets.length" class="tag-row event-paper__files">
        <span v-for="asset in otherAssets" :key="asset.id" class="tag-chip">
          {{ asset.type }} / {{ asset.mime_type || 'file' }}
        </span>
      </div>

      <div v-if="comments.length" class="event-paper__comments">
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="paper-annotation event-paper__comment"
        >
          <div class="event-paper__comment-head">
            <span class="handwritten">{{ store.friendName(comment.sender) }}</span>
            <span class="muted">{{ store.formatDateTime(comment.time) }}</span>
          </div>
          <p>{{ comment.content }}</p>
        </article>
      </div>
    </div>

    <div v-if="ongoing" class="event-paper__actions">
      <ion-button color="success" size="small" @click.stop="emit('complete', event.id)">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" />
        {{ ui.t('complete') }}
      </ion-button>
      <ion-button color="danger" fill="outline" size="small" @click.stop="emit('fail', event.id)">
        <ion-icon slot="start" :icon="closeCircleOutline" />
        {{ ui.t('fail') }}
      </ion-button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { IonButton, IonIcon } from '@ionic/vue';
import { checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';

import { useAppStore } from '../store/app-store';
import { useUiPreferences } from '../ui/preferences';
import type { EventRecord } from '../types/models';

const props = defineProps<{
  event: EventRecord;
}>();

const emit = defineEmits<{
  complete: [id: string];
  fail: [id: string];
}>();

const router = useRouter();
const store = useAppStore();
const ui = useUiPreferences();

const displayTitle = computed(() => {
  if (props.event.title.trim()) {
    return props.event.title;
  }

  return ui.state.locale === 'zh-CN' ? '书写中' : 'Writing';
});
const formattedTime = computed(() => store.formatDateTime(store.effectiveTimeOf(props.event)));
const displayTags = computed(() =>
  store.sortDisplayTags(props.event.tags).slice(0, store.state.config.abstract_show_tag_count),
);
const excerpt = computed(() => {
  const text = props.event.raw.trim();
  if (!text) {
    return props.event.assets.length || props.event.comments.length ? '' : ui.t('title_only_friendly');
  }

  const limit = store.state.config.abstract_show_content_length;
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
});
const imageAssets = computed(() =>
  props.event.assets
    .filter((asset) => asset.type === 'image')
    .slice(0, store.state.config.abstract_show_picture_count),
);
const otherAssets = computed(() => props.event.assets.filter((asset) => asset.type !== 'image'));
const comments = computed(() =>
  [...props.event.comments]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, store.state.config.abstract_show_comment_count),
);
const ongoing = computed(() => store.isOngoingTask(props.event));
const statusLabel = computed(() => {
  if (store.isOngoingTask(props.event)) {
    return ui.t('task_state_ongoing');
  }

  if (store.isFinishedTask(props.event)) {
    return ui.t('task_state_finished');
  }

  if (store.isFailedTask(props.event)) {
    return ui.t('task_state_failed');
  }

  if (store.isTask(props.event)) {
    return ui.t('task_state_task');
  }

  return '';
});

function openDetail(): void {
  router.push(`/event/${props.event.id}`);
}
</script>

<style scoped>
.event-paper {
  position: relative;
  border-radius: 30px;
  background:
    linear-gradient(180deg, rgba(255, 251, 243, 0.96), rgba(247, 237, 216, 0.94)),
    repeating-linear-gradient(
      180deg,
      transparent,
      transparent 27px,
      rgba(145, 119, 86, 0.05) 27px,
      rgba(145, 119, 86, 0.05) 28px
    );
  border: 1px solid rgba(118, 89, 57, 0.14);
  box-shadow: 0 18px 30px rgba(88, 64, 34, 0.1);
  overflow: hidden;
}

.event-paper:nth-child(odd) {
  transform: rotate(-0.6deg);
}

.event-paper:nth-child(even) {
  transform: rotate(0.9deg);
}

.event-paper__surface {
  cursor: pointer;
  padding: 22px 22px 18px;
}

.event-paper__surface:focus-visible {
  outline: 3px solid rgba(116, 84, 51, 0.18);
  outline-offset: -3px;
}

.event-paper__top {
  align-items: start;
  gap: 14px;
}

.event-paper__title-block {
  display: grid;
  gap: 8px;
}

.event-paper__time {
  color: #846547;
  font-size: 0.98rem;
}

.event-paper__title {
  margin: 0;
  font-size: clamp(1.14rem, 1.8vw, 1.45rem);
  line-height: 1.2;
  color: #2a1e14;
}

.event-paper__stamp {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(112, 82, 50, 0.1);
  color: #684d32;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.event-paper__tags,
.event-paper__files {
  margin-top: 14px;
}

.event-paper__excerpt {
  margin: 16px 0 0;
  line-height: 1.76;
  white-space: pre-wrap;
}

.event-paper__photos {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin-top: 18px;
}

.event-paper__photo {
  position: relative;
  margin: 0;
  padding: 10px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 12px 22px rgba(88, 64, 34, 0.1);
}

.event-paper__photo:nth-child(odd) {
  transform: rotate(-1.8deg);
}

.event-paper__photo:nth-child(even) {
  transform: rotate(1.4deg) translateY(6px);
}

.event-paper__photo::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 16px;
  width: 56px;
  height: 18px;
  border-radius: 5px;
  background: rgba(230, 210, 173, 0.76);
}

.event-paper__photo img {
  width: 100%;
  height: 152px;
  display: block;
  object-fit: cover;
  border-radius: 12px;
}

.event-paper__comments {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  margin-top: 18px;
}

.event-paper__comment:nth-child(odd) {
  transform: rotate(-1.8deg);
}

.event-paper__comment:nth-child(even) {
  transform: rotate(1.6deg) translateY(4px);
}

.event-paper__comment-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 12px;
}

.event-paper__comment p {
  margin: 0;
  line-height: 1.64;
}

.event-paper__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 22px 18px;
  border-top: 1px dashed rgba(118, 89, 57, 0.18);
}

.event-paper__actions ion-button {
  margin: 0;
}

@media (max-width: 620px) {
  .event-paper {
    border-radius: 24px;
  }

  .event-paper__surface {
    padding: 18px 18px 16px;
  }

  .event-paper__top {
    gap: 10px;
  }

  .event-paper__title-block {
    gap: 6px;
  }

  .event-paper__time {
    font-size: 0.92rem;
  }

  .event-paper__title {
    font-size: 1.02rem;
  }

  .event-paper__excerpt {
    margin-top: 12px;
    line-height: 1.64;
  }

  .event-paper__tags,
  .event-paper__files,
  .event-paper__photos,
  .event-paper__comments {
    margin-top: 14px;
  }

  .event-paper__actions {
    padding: 0 18px 16px;
  }
}
</style>
