<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>New</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="submit">
            <ion-icon slot="start" :icon="sendOutline" />
            发送
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap card-stack">
        <ion-card class="sketch-card">
          <ion-card-header>
            <ion-card-title>创建 Event</ion-card-title>
            <ion-card-subtitle>标题可以留空，AI 会异步补全。</ion-card-subtitle>
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

            <div>
              <div class="section-title">资源</div>
              <div class="row wrap">
                <ion-button fill="outline" @click="cameraInput?.click()">
                  <ion-icon slot="start" :icon="cameraOutline" />
                  相机
                </ion-button>
                <ion-button fill="outline" @click="imageInput?.click()">
                  <ion-icon slot="start" :icon="imageOutline" />
                  图片
                </ion-button>
                <ion-button fill="outline" @click="videoInput?.click()">
                  <ion-icon slot="start" :icon="videocamOutline" />
                  视频
                </ion-button>
                <ion-button fill="outline" @click="audioInput?.click()">
                  <ion-icon slot="start" :icon="musicalNotesOutline" />
                  音频
                </ion-button>
              </div>

              <input
                ref="cameraInput"
                hidden
                accept="image/*"
                capture="environment"
                type="file"
                @change="handleFiles($event, 'image')"
              />
              <input ref="imageInput" hidden accept="image/*" multiple type="file" @change="handleFiles($event, 'image')" />
              <input ref="videoInput" hidden accept="video/*" multiple type="file" @change="handleFiles($event, 'video')" />
              <input ref="audioInput" hidden accept="audio/*" multiple type="file" @change="handleFiles($event, 'audio')" />
            </div>

            <div v-if="assets.length" class="preview-grid">
              <div v-for="asset in assets" :key="asset.id" class="preview-card">
                <img v-if="asset.type === 'image'" :src="asset.filepath" alt="preview" />
                <video v-else-if="asset.type === 'video'" :src="asset.filepath" muted />
                <div v-else class="preview-meta">🎵 {{ asset.mime_type || 'audio' }}</div>
                <div class="preview-meta row between">
                  <span>{{ asset.type }}</span>
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
import { cameraOutline, imageOutline, musicalNotesOutline, pricetagOutline, sendOutline, videocamOutline } from 'ionicons/icons';

import { useAppStore } from '../store/app-store';
import type { AssetRecord, TagType } from '../types/models';

const store = useAppStore();

const title = ref('');
const raw = ref('');
const selectedTagKeys = ref<string[]>([]);
const assets = ref<AssetRecord[]>([]);

const cameraInput = ref<HTMLInputElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);
const audioInput = ref<HTMLInputElement | null>(null);

const userTags = computed(() => store.availableTags.value.filter((tag) => !tag.system));

function toggleTag(type: TagType, label: string): void {
  const key = `${type}:${label}`;
  if (selectedTagKeys.value.includes(key)) {
    selectedTagKeys.value = selectedTagKeys.value.filter((item) => item !== key);
    return;
  }

  selectedTagKeys.value = [...selectedTagKeys.value, key];
}

function removeAsset(id: string): void {
  assets.value = assets.value.filter((asset) => asset.id !== id);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleFiles(domEvent: Event, type: AssetRecord['type']): Promise<void> {
  const input = domEvent.target as HTMLInputElement | null;
  const files = input?.files;
  if (!files?.length) {
    return;
  }

  const offset = assets.value.length;
  const loaded = await Promise.all(
    [...files].map(async (file, index) => ({
      id: `asset_${crypto.randomUUID().slice(0, 8)}`,
      filepath: await readFileAsDataUrl(file),
      type,
      upload_order: offset + index,
      mime_type: file.type,
      size_bytes: file.size,
    })),
  );

  assets.value = [...assets.value, ...loaded];
  input.value = '';
}

function submit(): void {
  if (!title.value.trim() && !raw.value.trim() && !assets.value.length) {
    window.alert('至少填写一点内容，或者附带一个资源。');
    return;
  }

  const tags = userTags.value.filter((tag) => selectedTagKeys.value.includes(`${tag.type}:${tag.label}`));
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
}
</script>
