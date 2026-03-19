<template>
  <ion-card class="sketch-card event-card">
    <div
      class="event-card__surface"
      role="button"
      tabindex="0"
      @click="openDetail"
      @keydown.enter.prevent="openDetail"
      @keydown.space.prevent="openDetail"
    >
      <ion-card-header>
        <div class="row between wrap">
          <div>
            <ion-card-title>{{ displayTitle }}</ion-card-title>
            <ion-card-subtitle>{{ formattedTime }}</ion-card-subtitle>
          </div>
          <ion-badge v-if="statusLabel" color="secondary">{{ statusLabel }}</ion-badge>
        </div>
      </ion-card-header>

      <ion-card-content>
        <div v-if="displayTags.length" class="tag-row" style="margin-bottom: 12px;">
          <span v-for="tag in displayTags" :key="`${tag.type}-${tag.label}`" class="tag-chip">
            {{ tag.label }}
          </span>
        </div>

        <p style="line-height: 1.7; white-space: pre-wrap;">{{ excerpt }}</p>

        <div v-if="imageAssets.length" class="event-assets" style="margin-top: 12px;">
          <img
            v-for="asset in imageAssets"
            :key="asset.id"
            :src="asset.display_path || asset.filepath"
            :alt="asset.mime_type || asset.type"
          />
        </div>

        <div v-if="otherAssets.length" class="tag-row" style="margin-top: 12px;">
          <span v-for="asset in otherAssets" :key="asset.id" class="tag-chip">
            {{ asset.type }} · {{ asset.mime_type || 'file' }}
          </span>
        </div>

        <div v-if="comments.length" style="margin-top: 14px;">
          <div class="section-title">最新评论</div>
          <div class="card-stack">
            <div
              v-for="comment in comments"
              :key="comment.id"
              style="padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid #ddc5a1;"
            >
              <div class="row between">
                <strong>{{ store.friendName(comment.sender) }}</strong>
                <span class="muted">{{ store.formatDateTime(comment.time) }}</span>
              </div>
              <div style="margin-top: 6px; line-height: 1.6;">{{ comment.content }}</div>
            </div>
          </div>
        </div>
      </ion-card-content>
    </div>

    <div v-if="ongoing" class="event-card__actions">
      <ion-button color="success" size="small" @click.stop="emit('complete', event.id)">
        <ion-icon slot="start" :icon="checkmarkCircleOutline" />
        完成
      </ion-button>
      <ion-button color="danger" fill="outline" size="small" @click.stop="emit('fail', event.id)">
        <ion-icon slot="start" :icon="closeCircleOutline" />
        放弃
      </ion-button>
    </div>
  </ion-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
} from '@ionic/vue';
import { checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';

import { useAppStore } from '../store/app-store';
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

const displayTitle = computed(() => props.event.title || 'AI 正在补标题…');
const formattedTime = computed(() => store.formatDateTime(store.effectiveTimeOf(props.event)));
const displayTags = computed(() =>
  store.sortDisplayTags(props.event.tags).slice(0, store.state.config.abstract_show_tag_count),
);
const excerpt = computed(() => {
  const text = props.event.raw.trim();
  if (!text) {
    return '（无正文）';
  }

  const limit = store.state.config.abstract_show_content_length;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
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
    return '进行中';
  }

  if (store.isFinishedTask(props.event)) {
    return '已完成';
  }

  if (store.isFailedTask(props.event)) {
    return '未完成';
  }

  if (store.isTask(props.event)) {
    return '任务';
  }

  return '';
});

function openDetail(): void {
  router.push(`/event/${props.event.id}`);
}
</script>
