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

        <div class="flow-toolbar card-stack">
          <div class="row wrap">
            <ion-button fill="outline" @click="openTagsWindow">
              标签筛选
            </ion-button>

            <label class="flow-toolbar__date">
              <span class="section-title" style="margin-bottom: 6px;">跳转日期</span>
              <input v-model="jumpDate" class="native-input" type="date" @change="jumpToNearestDate" />
            </label>
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

        <div class="flow-timeline">
          <section
            v-for="group in visibleDayGroups"
            :key="group.date"
            :ref="(element) => registerDayRef(group.date, element)"
            class="flow-day"
          >
            <div class="flow-day__rail">
              <div class="flow-day__dot" />
              <div class="flow-day__date">{{ group.date }}</div>
            </div>

            <div class="flow-day__cards card-stack">
              <EventCard
                v-for="event in group.events"
                :key="event.id"
                :event="event"
                @complete="store.completeTask"
                @fail="store.failTask"
              />
            </div>
          </section>

          <div v-if="!filteredEvents.length" class="empty-note">
            当前没有匹配到内容，试试清空关键词或标签筛选。
          </div>
        </div>

        <ion-infinite-scroll
          v-if="filteredEvents.length > visibleCount"
          threshold="120px"
          @ionInfinite="loadMore"
        >
          <ion-infinite-scroll-content loading-spinner="bubbles" loading-text="继续加载事件…" />
        </ion-infinite-scroll>
      </div>
    </ion-content>

    <TagsWindow
      :open="tagsWindowOpen"
      mode="filter"
      :tags="filterableTags"
      :selected-keys="selectedTagKeys"
      :default-location-payload="currentLocation?.payload ?? null"
      @cancel="tagsWindowOpen = false"
      @apply="applyTags"
    />

    <CameraButton />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import CameraButton from '../components/CameraButton.vue';
import EventCard from '../components/EventCard.vue';
import TagsWindow from '../components/TagsWindow.vue';
import { locationService } from '../services';
import { useAppStore } from '../store/app-store';

const INITIAL_PAGE_SIZE = 16;
const PAGE_SIZE = 12;

const store = useAppStore();
const query = ref('');
const jumpDate = ref('');
const selectedTagKeys = ref<string[]>([]);
const tagsWindowOpen = ref(false);
const visibleCount = ref(INITIAL_PAGE_SIZE);
const currentLocation = ref<Awaited<ReturnType<typeof locationService.getCurrentLocation>> | null>(null);
const dayRefs = new Map<string, HTMLElement>();

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

const visibleEvents = computed(() => filteredEvents.value.slice(0, visibleCount.value));

const allDayGroups = computed(() => {
  const groups = new Map<string, typeof filteredEvents.value>();

  filteredEvents.value.forEach((event) => {
    const key = store.effectiveTimeOf(event).slice(0, 10);
    const items = groups.get(key) ?? [];
    items.push(event);
    groups.set(key, items);
  });

  return [...groups.entries()].map(([date, events]) => ({ date, events }));
});

const visibleDayGroups = computed(() => {
  const groups = new Map<string, typeof visibleEvents.value>();

  visibleEvents.value.forEach((event) => {
    const key = store.effectiveTimeOf(event).slice(0, 10);
    const items = groups.get(key) ?? [];
    items.push(event);
    groups.set(key, items);
  });

  return [...groups.entries()].map(([date, events]) => ({ date, events }));
});

watch([query, selectedTagKeys], () => {
  visibleCount.value = INITIAL_PAGE_SIZE;
});

async function ensureCurrentLocation(): Promise<void> {
  if (currentLocation.value) {
    return;
  }

  try {
    currentLocation.value = await locationService.getCurrentLocation();
  } catch {
    currentLocation.value = null;
  }
}

async function openTagsWindow(): Promise<void> {
  tagsWindowOpen.value = true;
  await ensureCurrentLocation();
}

function applyTags(payload: { selectedKeys: string[] }): void {
  selectedTagKeys.value = payload.selectedKeys;
  tagsWindowOpen.value = false;
}

function registerDayRef(date: string, element: Element | null): void {
  if (element instanceof HTMLElement) {
    dayRefs.set(date, element);
    return;
  }

  dayRefs.delete(date);
}

async function jumpToNearestDate(): Promise<void> {
  if (!jumpDate.value || !allDayGroups.value.length) {
    return;
  }

  const targetTime = new Date(jumpDate.value).getTime();
  const nearest = allDayGroups.value
    .map((group) => ({
      date: group.date,
      distance: Math.abs(new Date(group.date).getTime() - targetTime),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (!nearest) {
    return;
  }

  const targetIndex = filteredEvents.value.findIndex(
    (event) => store.effectiveTimeOf(event).slice(0, 10) === nearest.date,
  );

  if (targetIndex >= 0 && targetIndex + 1 > visibleCount.value) {
    visibleCount.value = targetIndex + 6;
    await nextTick();
  }

  dayRefs.get(nearest.date)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function loadMore(event: CustomEvent): void {
  visibleCount.value = Math.min(filteredEvents.value.length, visibleCount.value + PAGE_SIZE);
  const target = event.target as HTMLIonInfiniteScrollElement | null;
  target?.complete();
}
</script>

<style scoped>
.flow-toolbar {
  margin-top: 12px;
  margin-bottom: 16px;
}

.flow-toolbar__date {
  min-width: 220px;
  flex: 1 1 220px;
}

.flow-timeline {
  position: relative;
  display: grid;
  gap: 16px;
}

.flow-day {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.flow-day__rail {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  min-height: 100%;
}

.flow-day__rail::after {
  content: '';
  position: absolute;
  right: 14px;
  top: 20px;
  bottom: -24px;
  width: 2px;
  background: linear-gradient(180deg, rgba(122, 91, 62, 0.45), rgba(122, 91, 62, 0));
}

.flow-day__dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #7a5b3e;
  box-shadow: 0 0 0 4px rgba(122, 91, 62, 0.14);
  z-index: 1;
}

.flow-day__date {
  padding-right: 24px;
  color: #7b6247;
  font-size: 13px;
  font-weight: 700;
}

.flow-day__cards {
  min-width: 0;
}

@media (max-width: 680px) {
  .flow-day {
    grid-template-columns: 1fr;
  }

  .flow-day__rail {
    position: static;
    align-items: flex-start;
    padding-left: 18px;
  }

  .flow-day__rail::after {
    left: 5px;
    right: auto;
  }

  .flow-day__date {
    padding-right: 0;
    padding-left: 14px;
  }
}
</style>
