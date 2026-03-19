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
            <ion-card-subtitle>移动端优先：媒体、定位与存储都走 Capacitor 服务层。</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="card-stack">
            <label>
              <div class="section-title">标题</div>
              <input v-model="title" class="native-input" placeholder="可选：先写一个标题" />
            </label>

            <label>
              <div class="section-title">正文</div>
              <textarea
                v-model="raw"
                class="native-textarea"
                placeholder="记录今天发生了什么，支持只发一句话。"
              />
            </label>

            <div class="card-stack">
              <div class="section-title">能力入口</div>
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
                  文件上传
                </ion-button>
                <ion-button fill="outline" :disabled="working" @click="attachLocation">
                  <ion-icon slot="start" :icon="locateOutline" />
                  获取定位
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

              <div v-if="currentLocation" class="empty-note">
                已附带位置：{{ currentLocation.label }}
                <span v-if="currentLocation.accuracy_meters != null">（精度约 {{ Math.round(currentLocation.accuracy_meters) }}m）</span>
              </div>
            </div>

            <div v-if="assets.length" class="preview-grid">
              <div v-for="asset in assets" :key="asset.id" class="preview-card">
                <img v-if="asset.type === 'image'" :src="asset.display_path || asset.filepath" alt="preview" />
                <video v-else-if="asset.type === 'video'" :src="asset.display_path || asset.filepath" muted />
                <div v-else class="preview-meta">🎵 {{ asset.mime_type || 'audio' }}</div>
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

        <ion-card class="sketch-card">
          <ion-card-header>
            <ion-card-title>
              <ion-icon :icon="pricetagOutline" style="vertical-align: middle; margin-right: 6px;" />
              Tags
            </ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div class="tag-row">
              <button
                v-for="tag in userTags"
                :key="`${tag.type}-${tag.label}`"
                class="tag-chip"
                :class="{ 'is-selected': selectedTagKeys.includes(`${tag.type}:${tag.label}`) }"
                @click="toggleTag(tag.type, tag.label)"
              >
                {{ tag.label }}
              </button>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
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
  locateOutline,
  pricetagOutline,
  sendOutline,
} from 'ionicons/icons';

import { cameraService, fileService, locationService } from '../services';
import { useAppStore } from '../store/app-store';
import type { AssetRecord, TagType } from '../types/models';

const store = useAppStore();

const title = ref('');
const raw = ref('');
const selectedTagKeys = ref<string[]>([]);
const assets = ref<AssetRecord[]>([]);
const currentLocation = ref<Awaited<ReturnType<typeof locationService.getCurrentLocation>> | null>(null);
const working = ref(false);
const submitting = ref(false);

const fileInput = ref<HTMLInputElement | null>(null);

const userTags = computed(() => store.availableTags.value.filter((tag) => !tag.system));

function toggleTag(type: TagType, label: string): void {
  const key = `${type}:${label}`;
  if (selectedTagKeys.value.includes(key)) {
    selectedTagKeys.value = selectedTagKeys.value.filter((item) => item !== key);
    return;
  }

  selectedTagKeys.value = [...selectedTagKeys.value, key];
}

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

async function attachLocation(): Promise<void> {
  working.value = true;
  try {
    currentLocation.value = await locationService.getCurrentLocation();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '获取定位失败');
  } finally {
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
  if (!title.value.trim() && !raw.value.trim() && !assets.value.length) {
    window.alert('至少填写一点内容，或者附带一个资源。');
    return;
  }

  submitting.value = true;
  try {
    const tags = userTags.value.filter((tag) => selectedTagKeys.value.includes(`${tag.type}:${tag.label}`));
    if (currentLocation.value) {
      tags.push(locationService.buildLocationTag(currentLocation.value));
    }

    store.createEvent({
      title: title.value,
      raw: raw.value,
      tags,
      assets: assets.value,
    });

    title.value = '';
    raw.value = '';
    assets.value = [];
    selectedTagKeys.value = [];
    currentLocation.value = null;
  } finally {
    submitting.value = false;
  }
}
</script>
