<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>{{ ui.t('app_new') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="submitting" @click="submit">
            <ion-icon slot="start" :icon="sendOutline" />
            {{ ui.t('publish') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap desk-stack">
        <section class="paper-sheet new-sheet">
          <div class="new-sheet__top row between wrap">
            <div>
              <div class="ink-label handwritten">{{ ui.t('loose_page') }}</div>
              <h2 class="ink-title">{{ ui.t('write_new_entry') }}</h2>
            </div>

            <div class="new-sheet__tools row wrap">
              <ion-button fill="outline" :disabled="working" @click="takePhoto">
                <ion-icon slot="start" :icon="cameraOutline" />
                {{ ui.t('camera') }}
              </ion-button>
              <ion-button fill="outline" :disabled="working" @click="pickImages">
                <ion-icon slot="start" :icon="imagesOutline" />
                {{ ui.t('images') }}
              </ion-button>
              <ion-button fill="outline" :disabled="working" @click="fileInput?.click()">
                <ion-icon slot="start" :icon="folderOpenOutline" />
                {{ ui.t('files') }}
              </ion-button>
              <ion-button fill="outline" :disabled="working" @click="openTagsWindow">
                <ion-icon slot="start" :icon="pricetagOutline" />
                {{ ui.t('tags') }}
              </ion-button>
            </div>
          </div>

          <div class="new-sheet__body">
            <label class="new-sheet__writing">
              <div class="section-title">{{ ui.t('body') }}</div>
              <textarea
                ref="rawInput"
                v-model="raw"
                class="native-textarea new-sheet__textarea"
                :placeholder="ui.t('entry_placeholder')"
                @input="resizeTextarea"
              />
            </label>

            <div v-if="hasSelectedSummary" class="paper-note new-sheet__tags">
              <div class="section-title">{{ ui.t('attached_context') }}</div>
              <div class="tag-row">
                <span v-for="tag in selectedTags" :key="`${tag.type}:${tag.label}`" class="tag-chip is-selected">
                  {{ tag.label }}
                </span>
                <span v-if="includeLocation" class="tag-chip is-selected">
                  {{ currentLocation?.label || ui.t('current_location') }}
                </span>
              </div>
            </div>

            <div v-if="assets.length" class="preview-grid new-sheet__assets">
              <div v-for="asset in assets" :key="asset.id" class="preview-card new-sheet__asset">
                <img v-if="asset.type === 'image'" :src="asset.display_path || asset.filepath" alt="preview" />
                <video
                  v-else-if="asset.type === 'video'"
                  :poster="asset.thumbnail_path"
                    :src="asset.display_path || asset.filepath"
                    muted
                />
                <div v-else class="preview-meta">{{ ui.t('audio') }}</div>
                <div class="preview-meta paper-stack">
                  <div class="row between">
                    <span>{{ asset.type }}</span>
                    <span v-if="asset.duration_ms">{{ Math.round(asset.duration_ms / 1000) }}s</span>
                    <span v-else-if="asset.size_bytes">{{ formatSize(asset.size_bytes) }}</span>
                  </div>
                  <button class="tag-chip" @click="removeAsset(asset.id)">{{ ui.t('remove_asset') }}</button>
                </div>
              </div>
            </div>
          </div>

          <input
            ref="fileInput"
            hidden
            accept="image/*,video/*,audio/*"
            multiple
            type="file"
            @change="handleUpload"
          />
        </section>
      </div>
    </ion-content>

    <TagsWindow
      :open="tagsWindowOpen"
      mode="create"
      :tags="userTags"
      :selected-keys="selectedTagKeys"
      :location-enabled="includeLocation"
      :current-location-label="currentLocation?.label || ''"
      @cancel="tagsWindowOpen = false"
      @apply="applyTags"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import {
  cameraOutline,
  folderOpenOutline,
  imagesOutline,
  pricetagOutline,
  sendOutline,
} from 'ionicons/icons';

import TagsWindow from '../components/TagsWindow.vue';
import { cameraService, fileService, locationService } from '../services';
import { useAppStore } from '../store/app-store';
import { useUiPreferences } from '../ui/preferences';
import type { AssetRecord } from '../types/models';

const router = useRouter();
const store = useAppStore();
const ui = useUiPreferences();

const raw = ref('');
const selectedTagKeys = ref<string[]>([]);
const assets = ref<AssetRecord[]>([]);
const currentLocation = ref<Awaited<ReturnType<typeof locationService.getCurrentLocation>> | null>(null);
const includeLocation = ref(true);
const working = ref(false);
const submitting = ref(false);
const tagsWindowOpen = ref(false);
const rawInput = ref<HTMLTextAreaElement | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);

const userTags = computed(() => store.availableTags.value.filter((tag) => !tag.system));
const selectedTags = computed(() =>
  userTags.value.filter((tag) => selectedTagKeys.value.includes(`${tag.type}:${tag.label}`)),
);
const hasSelectedSummary = computed(() => selectedTags.value.length > 0 || (includeLocation.value && !!currentLocation.value));

function normalizeOrders(nextAssets: AssetRecord[]): AssetRecord[] {
  return nextAssets.map((asset, index) => ({
    ...asset,
    upload_order: index,
  }));
}

function appendAssets(nextAssets: AssetRecord[]): void {
  assets.value = normalizeOrders([...assets.value, ...nextAssets]);
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function resizeTextarea(): void {
  const element = rawInput.value;
  if (!element) {
    return;
  }

  element.style.height = '0px';
  element.style.height = `${Math.max(200, element.scrollHeight)}px`;
}

onMounted(async () => {
  const primedAssets = store.consumeComposerAssets();
  if (primedAssets.length) {
    appendAssets(primedAssets);
  }

  await nextTick();
  resizeTextarea();
});

watch(raw, async () => {
  await nextTick();
  resizeTextarea();
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
  if (includeLocation.value) {
    await ensureCurrentLocation();
  }
}

function applyTags(payload: { selectedKeys: string[]; locationEnabled: boolean }): void {
  selectedTagKeys.value = payload.selectedKeys;
  includeLocation.value = payload.locationEnabled;
  tagsWindowOpen.value = false;
}

async function takePhoto(): Promise<void> {
  working.value = true;
  try {
    const asset = await cameraService.takePhoto();
    if (asset) {
      appendAssets([asset]);
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : ui.t('camera'));
  } finally {
    working.value = false;
  }
}

async function pickImages(): Promise<void> {
  working.value = true;
  try {
    appendAssets(await cameraService.pickImages(8));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : ui.t('images'));
  } finally {
    working.value = false;
  }
}

async function handleUpload(domEvent: Event): Promise<void> {
  const input = domEvent.target as HTMLInputElement | null;
  const files = input?.files;
  if (!files?.length) {
    return;
  }

  working.value = true;
  try {
    appendAssets(await fileService.saveFiles(files, undefined, assets.value.length));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : ui.t('files'));
  } finally {
    if (input) {
      input.value = '';
    }
    working.value = false;
  }
}

function removeAsset(id: string): void {
  const target = assets.value.find((asset) => asset.id === id);
  assets.value = normalizeOrders(assets.value.filter((asset) => asset.id !== id));

  if (target) {
    void fileService.removeAsset(target);
  }
}

async function submit(): Promise<void> {
  if (!raw.value.trim() && !assets.value.length) {
    window.alert(ui.t('write_something_or_attach_media'));
    return;
  }

  submitting.value = true;
  try {
    if (includeLocation.value) {
      await ensureCurrentLocation();
    }

    const tags = userTags.value.filter((tag) => selectedTagKeys.value.includes(`${tag.type}:${tag.label}`));
    if (includeLocation.value && currentLocation.value) {
      tags.push(locationService.buildLocationTag(currentLocation.value));
    }

    store.createEvent({
      title: '',
      raw: raw.value,
      tags,
      assets: assets.value,
    });

    raw.value = '';
    assets.value = [];
    selectedTagKeys.value = [];
    currentLocation.value = null;
    includeLocation.value = true;

    await router.push('/tabs/flow');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.new-sheet {
  padding: 24px;
}

.new-sheet__top {
  align-items: start;
  gap: 18px;
}

.new-sheet__tools {
  position: sticky;
  top: 76px;
  z-index: 2;
  padding: 10px;
  border-radius: 999px;
  background: rgba(255, 247, 232, 0.88);
  border: 1px solid rgba(118, 89, 57, 0.16);
  box-shadow: 0 12px 24px rgba(88, 64, 34, 0.08);
}

.new-sheet__body {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

.new-sheet__writing {
  display: grid;
  gap: 10px;
}

.new-sheet__textarea {
  min-height: 220px;
  border-radius: 24px;
  line-height: 1.8;
  resize: none;
  overflow: hidden;
}

.new-sheet__tags {
  max-width: 560px;
}

.new-sheet__assets {
  margin-top: 6px;
}

.new-sheet__asset {
  background: rgba(255, 252, 246, 0.94);
}

@media (max-width: 680px) {
  .new-sheet__tools {
    border-radius: 28px;
  }
}
</style>
