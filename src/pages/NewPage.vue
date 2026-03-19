<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>New</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="submitting" @click="submit">
            <ion-icon slot="start" :icon="sendOutline" />
            发布
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap card-stack">
        <ion-card class="sketch-card">
          <ion-card-header>
            <ion-card-title>创建 Event</ion-card-title>
          </ion-card-header>
          <ion-card-content class="card-stack">
            <label>
              <div class="section-title">正文</div>
              <textarea
                v-model="raw"
                class="native-textarea"
                placeholder="记录今天发生了什么。"
              />
            </label>

            <div class="card-stack">
              <div class="section-title">工具</div>
              <div class="row wrap">
                <ion-button fill="outline" :disabled="working" @click="takePhoto">
                  <ion-icon slot="start" :icon="cameraOutline" />
                  拍摄
                </ion-button>
                <ion-button fill="outline" :disabled="working" @click="pickImages">
                  <ion-icon slot="start" :icon="imagesOutline" />
                  相册
                </ion-button>
                <ion-button fill="outline" :disabled="working" @click="fileInput?.click()">
                  <ion-icon slot="start" :icon="folderOpenOutline" />
                  文件
                </ion-button>
                <ion-button fill="outline" :disabled="working" @click="openTagsWindow">
                  <ion-icon slot="start" :icon="pricetagOutline" />
                  标签
                </ion-button>
              </div>

              <input
                ref="fileInput"
                hidden
                accept="image/*,video/*,audio/*"
                multiple
                type="file"
                @change="handleUpload"
              />
            </div>

            <div v-if="hasSelectedSummary" class="card-stack">
              <div class="section-title">已选标签</div>
              <div class="tag-row">
                <span v-for="tag in selectedTags" :key="`${tag.type}:${tag.label}`" class="tag-chip is-selected">
                  {{ tag.label }}
                </span>
                <span v-if="includeLocation" class="tag-chip is-selected">
                  {{ currentLocation?.label || '当前位置' }}
                </span>
              </div>
            </div>

            <div v-if="assets.length" class="preview-grid">
              <div v-for="asset in assets" :key="asset.id" class="preview-card">
                <img v-if="asset.type === 'image'" :src="asset.display_path || asset.filepath" alt="preview" />
                <video v-else-if="asset.type === 'video'" :src="asset.display_path || asset.filepath" muted />
                <div v-else class="preview-meta">音频</div>
                <div class="preview-meta card-stack">
                  <div class="row between">
                    <span>{{ asset.type }}</span>
                    <span v-if="asset.size_bytes">{{ formatSize(asset.size_bytes) }}</span>
                  </div>
                  <button class="tag-chip" @click="removeAsset(asset.id)">移除</button>
                </div>
              </div>
            </div>
          </ion-card-content>
        </ion-card>
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
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
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
import type { AssetRecord } from '../types/models';

const router = useRouter();
const store = useAppStore();

const raw = ref('');
const selectedTagKeys = ref<string[]>([]);
const assets = ref<AssetRecord[]>([]);
const currentLocation = ref<Awaited<ReturnType<typeof locationService.getCurrentLocation>> | null>(null);
const includeLocation = ref(true);
const working = ref(false);
const submitting = ref(false);
const tagsWindowOpen = ref(false);

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
    window.alert(error instanceof Error ? error.message : '拍摄失败');
  } finally {
    working.value = false;
  }
}

async function pickImages(): Promise<void> {
  working.value = true;
  try {
    appendAssets(await cameraService.pickImages(8));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '选择图片失败');
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
    window.alert(error instanceof Error ? error.message : '文件上传失败');
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
    window.alert('至少写一点内容，或者附带一项媒体。');
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
