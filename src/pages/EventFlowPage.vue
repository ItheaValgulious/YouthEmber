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

        <div class="tag-row" style="margin-top: 12px;">
          <button
            v-for="tag in filterTags"
            :key="`${tag.type}-${tag.label}`"
            class="tag-chip"
            :class="{ 'is-selected': selectedTags.includes(tag.label) }"
            @click="toggleTag(tag.label)"
          >
            {{ tag.label }}
          </button>
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
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonContent, IonHeader, IonPage, IonSearchbar, IonTitle, IonToolbar } from '@ionic/vue';

import EventCard from '../components/EventCard.vue';
import { useAppStore } from '../store/app-store';

const store = useAppStore();
const query = ref('');
const selectedTags = ref<string[]>([]);

const filterTags = computed(() => store.availableTags.value.filter((tag) => !tag.system).slice(0, 16));

const filteredEvents = computed(() => {
  const keyword = query.value.trim().toLowerCase();

  return store.sortedEvents.value.filter((event) => {
    const haystack = `${event.title} ${event.raw} ${event.tags.map((tag) => tag.label).join(' ')}`.toLowerCase();

    if (keyword && !haystack.includes(keyword)) {
      return false;
    }

    if (
      selectedTags.value.length &&
      !selectedTags.value.every((label) => event.tags.some((tag) => tag.label === label))
    ) {
      return false;
    }

    return true;
  });
});

function toggleTag(label: string): void {
  if (selectedTags.value.includes(label)) {
    selectedTags.value = selectedTags.value.filter((item) => item !== label);
    return;
  }

  selectedTags.value = [...selectedTags.value, label];
}
</script>
