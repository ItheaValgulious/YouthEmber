<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>{{ ui.t('app_flow') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap content-wrap--wide desk-stack">
        <section class="paper-sheet flow-toolbar">
          <div class="flow-toolbar__header row between wrap">
            <div>
              <div class="ink-label handwritten">{{ ui.t('paper_trail') }}</div>
              <h2 class="ink-title">{{ ui.t('daily_flow') }}</h2>
            </div>

            <label class="flow-toolbar__date">
              <div class="section-title">{{ ui.t('jump_to_date') }}</div>
              <input v-model="jumpDate" class="native-input" type="date" @change="jumpToNearestDate" />
            </label>
          </div>

          <div class="flow-toolbar__filters desk-stack">
            <ion-searchbar v-model="query" :placeholder="ui.t('search_placeholder')" />

            <div class="row wrap">
              <ion-button fill="outline" @click="openTagsWindow">{{ ui.t('filter_tags') }}</ion-button>
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
        </section>

        <section class="flow-timeline">
          <article
            v-for="group in visibleDayGroups"
            :key="group.date"
            :ref="(element) => registerDayRef(group.date, element)"
            class="flow-day"
          >
            <div class="flow-day__rail">
              <div class="flow-day__dot" />
              <div class="flow-day__date handwritten">{{ group.date }}</div>
            </div>

            <div class="flow-day__stack">
              <EventCard
                v-for="event in group.events"
                :key="event.id"
                :event="event"
                @complete="store.completeTask"
                @fail="store.failTask"
              />
            </div>
          </article>

          <div v-if="!filteredEvents.length" class="empty-note">
            {{ ui.t('no_matching_entries') }}
          </div>
        </section>

        <ion-infinite-scroll
          v-if="filteredEvents.length > visibleCount"
          threshold="120px"
          @ionInfinite="loadMore"
        >
          <ion-infinite-scroll-content loading-spinner="bubbles" :loading-text="ui.t('loading_more_entries')" />
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
import { useUiPreferences } from '../ui/preferences';

const INITIAL_PAGE_SIZE = 16;
const PAGE_SIZE = 12;

const store = useAppStore();
const ui = useUiPreferences();
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
  padding: 24px;
}

.flow-toolbar__header {
  align-items: end;
  gap: 18px;
}

.flow-toolbar__date {
  min-width: 220px;
  flex: 1 1 220px;
}

.flow-toolbar__filters {
  margin-top: 18px;
}

.flow-timeline {
  --flow-line-left: 115px;
  position: relative;
  display: grid;
  gap: 18px;
}

.flow-day {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.flow-day::before {
  content: '';
  position: absolute;
  top: 16px;
  bottom: -18px;
  left: var(--flow-line-left);
  width: 2px;
  border-radius: 999px;
  background: rgba(116, 84, 51, 0.28);
  pointer-events: none;
  z-index: 0;
}

.flow-day:last-of-type::before {
  bottom: 0;
  background: linear-gradient(180deg, rgba(116, 84, 51, 0.38), rgba(116, 84, 51, 0));
}

.flow-day__rail {
  position: sticky;
  top: 76px;
  display: grid;
  justify-items: end;
  gap: 12px;
  padding-right: 18px;
  z-index: 1;
}

.flow-day__dot {
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: #715338;
  box-shadow: 0 0 0 6px rgba(113, 83, 56, 0.12);
  z-index: 1;
}

.flow-day__date {
  color: #6c5238;
  font-size: clamp(1rem, 1.6vw, 1.22rem);
  text-align: right;
}

.flow-day__stack {
  position: relative;
  display: grid;
  gap: 18px;
  z-index: 1;
}

@media (max-width: 760px) {
  .flow-timeline {
    --flow-line-left: 25.5px;
  }

  .flow-day {
    grid-template-columns: 1fr;
  }

  .flow-day__rail {
    position: static;
    justify-items: start;
    padding-right: 0;
    padding-left: 20px;
  }

  .flow-day__date {
    text-align: left;
  }
}
</style>
