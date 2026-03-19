<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>Event Flow</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap">
        <div class="section-title">筛选</div>
        <ion-searchbar v-model="query" placeholder="搜索标题、正文或标签" />

        <div class="card-stack" style="margin-top: 12px;">
          <div class="row wrap">
            <ion-button fill="outline" @click="tagsWindowOpen = true">
              标签筛选
            </ion-button>
          </div>

          <div v-if="selectedFilterTags.length" class="tag-row">
            <span
              v-for="tag in selectedFilterTags"
              :key="`${tag.type}:${tag.label}`"
              class="tag-chip is-selected"
            >
              {{ tag.label }}
            </span>
          </div>
        </div>

        <div style="margin-top: 16px;" class="card-stack">
          <EventCard
            v-for="event in filteredEvents"
            :key="event.id"
            :event="event"
            @complete="store.completeTask"
            @fail="store.failTask"
          />

          <div v-if="!filteredEvents.length" class="empty-note">
            当前没有匹配到内容，试试清空关键词或标签筛选。
          </div>
        </div>
      </div>
    </ion-content>

    <TagsWindow
      :open="tagsWindowOpen"
      mode="filter"
      :tags="filterableTags"
      :selected-keys="selectedTagKeys"
      @cancel="tagsWindowOpen = false"
      @apply="applyTags"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonContent, IonHeader, IonPage, IonSearchbar, IonTitle, IonToolbar } from '@ionic/vue';

import EventCard from '../components/EventCard.vue';
import TagsWindow from '../components/TagsWindow.vue';
import { useAppStore } from '../store/app-store';

const store = useAppStore();
const query = ref('');
const selectedTagKeys = ref<string[]>([]);
const tagsWindowOpen = ref(false);

const filterableTags = computed(() => store.availableTags.value.filter((tag) => !tag.system));
const selectedFilterTags = computed(() =>
  filterableTags.value.filter((tag) => selectedTagKeys.value.includes(`${tag.type}:${tag.label}`)),
);

const filteredEvents = computed(() => {
  const keyword = query.value.trim().toLowerCase();

  return store.sortedEvents.value.filter((event) => {
    const haystack = `${event.title} ${event.raw} ${event.tags.map((tag) => tag.label).join(' ')}`.toLowerCase();

    if (keyword && !haystack.includes(keyword)) {
      return false;
    }

    if (
      selectedTagKeys.value.length &&
      !selectedTagKeys.value.every((key) =>
        event.tags.some((tag) => `${tag.type}:${tag.label}` === key),
      )
    ) {
      return false;
    }

    return true;
  });
});

function applyTags(payload: { selectedKeys: string[] }): void {
  selectedTagKeys.value = payload.selectedKeys;
  tagsWindowOpen.value = false;
}
</script>
