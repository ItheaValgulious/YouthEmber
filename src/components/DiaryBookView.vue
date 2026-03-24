<template>
  <section class="diary-view">
    <div class="diary-view__topbar row between wrap">
      <div>
        <div class="ink-label handwritten">{{ ui.t('one_sheet_at_a_time') }}</div>
        <h2 class="ink-title">{{ ui.t('diary_book') }}</h2>
      </div>

      <div class="row wrap">
        <ion-button fill="outline" :disabled="currentPageIndex <= 0" @click="goToPreviousPage">
          {{ ui.t('previous') }}
        </ion-button>
        <div class="diary-view__index handwritten">
          {{ ui.t('page_index', { current: pages.length ? currentPageIndex + 1 : 0, total: pages.length }) }}
        </div>
        <ion-button fill="outline" :disabled="currentPageIndex >= pages.length - 1" @click="goToNextPage">
          {{ ui.t('next') }}
        </ion-button>
      </div>
    </div>

    <div
      ref="viewport"
      class="diary-view__viewport"
      @touchstart="handleTouchStart"
      @touchend="handleTouchEnd"
    >
      <transition :name="pageTurnDirection === 'backward' ? 'page-back' : 'page-forward'" mode="out-in">
        <div
          v-if="currentPage && diaryBook"
          :key="currentPage.key"
          class="diary-view__page-shell"
          :style="pageShellStyle"
        >
          <div class="diary-view__page" :style="pageStyle">
            <div class="diary-view__page-meta row between wrap">
              <div class="handwritten">{{ ui.t('scrapbook_notes') }}</div>
              <div class="muted">{{ ui.t('swipe_left_right') }}</div>
            </div>

            <template v-for="block in currentPage.blocks" :key="block.id">
              <div
                v-if="block.type === 'date'"
                class="diary-view__block diary-date-note handwritten"
                :class="{ 'is-carry': block.carry_over }"
                :style="blockStyle(block)"
              >
                {{ block.label }}
              </div>

              <article
                v-else-if="block.type === 'event_text'"
                class="diary-view__block diary-entry paper-note"
                :class="{ 'is-continuation': block.continuation, 'is-title-only': block.body_kind === 'title_only' }"
                :style="blockStyle(block)"
              >
                <div class="diary-entry__heading">
                  <div class="diary-entry__eyebrow handwritten">{{ block.time_label }}</div>
                  <h3 class="diary-entry__title">{{ block.title || pendingTitleLabel }}</h3>
                </div>

                <p v-if="block.body_kind === 'title_only'" class="diary-entry__text muted">
                  {{ ui.t('title_only_friendly') }}
                </p>
                <p v-else-if="block.body.trim()" class="diary-entry__text">
                  {{ block.body }}
                </p>

                <div v-if="block.other_assets.length" class="tag-row diary-entry__assets">
                  <span v-for="asset in block.other_assets" :key="asset.id" class="tag-chip">
                    {{ asset.type }} / {{ asset.label }}
                  </span>
                </div>
              </article>

              <figure
                v-else-if="block.type === 'event_image'"
                class="diary-view__block diary-photo"
                :style="blockStyle(block)"
              >
                <img :src="block.asset.display_path || block.asset.filepath" :alt="block.asset.filename || ui.t('images')" />
              </figure>

              <article
                v-else-if="block.type === 'comment_group'"
                class="diary-view__block diary-comments"
                :class="[`is-${block.layout}`, { 'has-pair': shouldSplitCommentCards(block) }]"
                :style="blockStyle(block)"
              >
                <article
                  v-for="comment in block.comments"
                  :key="`${block.id}-${comment.id}-${comment.time_label}`"
                  class="paper-annotation diary-comments__item"
                >
                  <div class="diary-comments__meta">
                    <span class="handwritten">{{ comment.sender }}</span>
                    <span class="muted">{{ comment.time_label }}</span>
                  </div>
                  <p>{{ comment.content }}</p>
                </article>
              </article>

              <article
                v-else
                class="diary-view__block paper-slip diary-summary"
                :style="blockStyle(block)"
              >
                <div class="diary-summary__meta">
                  <span class="handwritten">{{ ui.t('summary_interval_label', { interval: block.interval }) }}</span>
                  <span>{{ block.range_label }}</span>
                </div>
                <h3>{{ block.title || ui.t('summary_interval_label', { interval: block.interval }) }}</h3>
                <p>{{ block.body }}</p>
              </article>
            </template>
          </div>
        </div>

        <div v-else key="empty" class="diary-view__empty empty-note">
          {{ ui.t('no_diary_content') }}
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { IonButton } from '@ionic/vue';

import { useAppStore } from '../store/app-store';
import { useUiPreferences } from '../ui/preferences';
import type { DiaryPlacedBlock } from '../types/models';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const store = useAppStore();
const ui = useUiPreferences();
const viewport = ref<HTMLElement | null>(null);
const currentPageIndex = ref(0);
const pageTurnDirection = ref<'forward' | 'backward'>('forward');
const touchStartX = ref<number | null>(null);
const scale = ref(1);

let resizeObserver: ResizeObserver | null = null;

const diaryBook = computed(() => store.diaryBook.value);
const pages = computed(() => diaryBook.value?.pages ?? []);
const currentPage = computed(() => pages.value[currentPageIndex.value] ?? null);
const pendingTitleLabel = computed(() => (ui.state.locale === 'zh-CN' ? '书写中' : 'Writing'));

const pageShellStyle = computed<CSSProperties>(() => {
  const book = diaryBook.value;
  if (!book) {
    return {};
  }

  return {
    width: `${Math.round(book.page_width * scale.value)}px`,
    height: `${Math.round(book.page_height * scale.value)}px`,
  };
});

const pageStyle = computed<CSSProperties>(() => {
  const book = diaryBook.value;
  if (!book) {
    return {};
  }

  return {
    width: `${book.page_width}px`,
    height: `${book.page_height}px`,
    transform: `scale(${scale.value})`,
    ['--diary-font-scale' as string]: String(book.font_scale ?? store.state.config.diary_font_scale),
  };
});

watch(
  pages,
  (nextPages) => {
    currentPageIndex.value = nextPages.length ? nextPages.length - 1 : 0;
  },
  { immediate: true },
);

function updateScale(): void {
  const book = diaryBook.value;
  const element = viewport.value;
  if (!book || !element) {
    scale.value = 1;
    return;
  }

  const rect = element.getBoundingClientRect();
  const widthScale = rect.width / book.page_width;
  const heightScale = rect.height / book.page_height;
  scale.value = clamp(Math.min(widthScale, heightScale), 0.25, 1);
}

async function ensureObserver(): Promise<void> {
  await nextTick();
  if (!viewport.value) {
    return;
  }

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    updateScale();
  });
  resizeObserver.observe(viewport.value);
  updateScale();
}

function blockStyle(block: DiaryPlacedBlock): CSSProperties {
  return {
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    height: `${block.height}px`,
    transform: `rotate(${block.rotation}deg)`,
  };
}

function shouldSplitCommentCards(block: Extract<DiaryPlacedBlock, { type: 'comment_group' }>): boolean {
  return block.layout === 'row' && block.comments.length === 2 && block.width >= 920;
}

function goToPage(index: number, direction: 'forward' | 'backward'): void {
  if (!pages.value.length) {
    return;
  }

  pageTurnDirection.value = direction;
  currentPageIndex.value = clamp(index, 0, pages.value.length - 1);
}

function goToPreviousPage(): void {
  goToPage(currentPageIndex.value - 1, 'backward');
}

function goToNextPage(): void {
  goToPage(currentPageIndex.value + 1, 'forward');
}

function handleTouchStart(event: TouchEvent): void {
  touchStartX.value = event.changedTouches[0]?.clientX ?? null;
}

function handleTouchEnd(event: TouchEvent): void {
  if (touchStartX.value == null) {
    return;
  }

  const delta = (event.changedTouches[0]?.clientX ?? touchStartX.value) - touchStartX.value;
  touchStartX.value = null;

  if (Math.abs(delta) < 56) {
    return;
  }

  if (delta < 0) {
    goToNextPage();
    return;
  }

  goToPreviousPage();
}

onMounted(async () => {
  window.addEventListener('resize', updateScale);
  window.addEventListener('orientationchange', updateScale);
  await ensureObserver();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScale);
  window.removeEventListener('orientationchange', updateScale);
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.diary-view {
  display: grid;
  gap: 18px;
}

.diary-view__topbar {
  align-items: end;
}

.diary-view__index {
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 247, 230, 0.9);
  border: 1px solid rgba(118, 89, 57, 0.16);
  color: #664c34;
}

.diary-view__viewport {
  position: relative;
  min-height: clamp(640px, 82vh, 980px);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.diary-view__page-shell {
  position: relative;
}

.diary-view__page {
  --diary-font-scale: 1;
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  border-radius: 34px 30px 28px 32px;
  background:
    linear-gradient(180deg, rgba(255, 253, 247, 0.98), rgba(248, 238, 217, 0.97)),
    var(--paper-sheet-image, none),
    repeating-linear-gradient(
      180deg,
      transparent,
      transparent 28px,
      rgba(149, 125, 96, 0.06) 28px,
      rgba(149, 125, 96, 0.06) 29px
    );
  background-size: cover, cover, auto;
  border: 1px solid rgba(123, 92, 60, 0.16);
  box-shadow:
    0 28px 48px rgba(85, 61, 31, 0.16),
    18px 0 0 rgba(239, 226, 198, 0.9) inset,
    -1px 0 0 rgba(255, 255, 255, 0.7) inset;
  overflow: hidden;
}

.diary-view__page::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.diary-view__page-meta {
  position: absolute;
  left: 140px;
  right: 140px;
  top: 86px;
  z-index: 1;
  font-size: 13px;
}

.diary-view__block {
  position: absolute;
}

.diary-date-note {
  display: flex;
  align-items: flex-end;
  color: #654a33;
  font-size: calc(54px * var(--diary-font-scale));
  line-height: 1.05;
}

.diary-date-note.is-carry {
  font-size: calc(42px * var(--diary-font-scale));
  opacity: 0.82;
}

.diary-entry {
  padding: calc(22px * var(--diary-font-scale)) calc(24px * var(--diary-font-scale));
  display: grid;
  align-content: start;
}

.diary-entry__heading {
  display: grid;
  gap: calc(8px * var(--diary-font-scale));
  margin-bottom: calc(12px * var(--diary-font-scale));
}

.diary-entry__eyebrow {
  color: #8a6a48;
  font-size: calc(26px * var(--diary-font-scale));
}

.diary-entry__title {
  margin: 0;
  font-size: calc(42px * var(--diary-font-scale));
  line-height: 1.24;
  color: #2d2117;
  overflow-wrap: anywhere;
}

.diary-entry__text,
.diary-summary p {
  margin: 0;
  line-height: 1.7;
  white-space: pre-wrap;
  font-size: calc(26px * var(--diary-font-scale));
  overflow-wrap: anywhere;
}

.diary-entry__assets {
  margin-top: calc(16px * var(--diary-font-scale));
}

.diary-entry.is-title-only {
  display: grid;
  align-content: center;
}

.diary-photo {
  margin: 0;
  padding: 12px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 24px rgba(84, 61, 32, 0.12);
}

.diary-photo::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 16px;
  width: 58px;
  height: 18px;
  border-radius: 4px;
  background: rgba(226, 205, 171, 0.76);
}

.diary-photo img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  border-radius: 12px;
  background: rgba(244, 237, 222, 0.75);
}

.diary-comments {
  display: grid;
  gap: calc(12px * var(--diary-font-scale));
  align-content: start;
  min-width: 0;
}

.diary-comments.has-pair {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.diary-comments__item {
  display: grid;
  gap: calc(8px * var(--diary-font-scale));
  align-content: start;
  height: 100%;
  min-width: 0;
  max-width: 100%;
}

.diary-comments__item:nth-child(odd) {
  transform: rotate(-1.8deg);
}

.diary-comments__item:nth-child(even) {
  transform: rotate(1.5deg) translateY(6px);
}

.diary-comments__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: calc(20px * var(--diary-font-scale));
}

.diary-comments__meta > * {
  min-width: 0;
  overflow-wrap: anywhere;
}

.diary-comments__item p {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  font-size: calc(22px * var(--diary-font-scale));
  overflow-wrap: anywhere;
  max-width: 100%;
}

.diary-summary {
  padding: calc(18px * var(--diary-font-scale)) calc(20px * var(--diary-font-scale));
}

.diary-summary__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: #73573b;
  font-size: calc(20px * var(--diary-font-scale));
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: calc(10px * var(--diary-font-scale));
}

.diary-summary h3 {
  margin: 0 0 12px;
  font-size: calc(34px * var(--diary-font-scale));
  line-height: 1.28;
  overflow-wrap: anywhere;
}

.diary-view__empty {
  min-height: inherit;
  display: grid;
  place-items: center;
  width: min(100%, 520px);
}

.page-forward-enter-active,
.page-forward-leave-active,
.page-back-enter-active,
.page-back-leave-active {
  transition:
    transform 260ms ease,
    opacity 260ms ease;
}

.page-forward-enter-from,
.page-back-leave-to {
  opacity: 0;
  transform: translateX(56px) rotate(1deg);
}

.page-forward-leave-to,
.page-back-enter-from {
  opacity: 0;
  transform: translateX(-56px) rotate(-1deg);
}
</style>
