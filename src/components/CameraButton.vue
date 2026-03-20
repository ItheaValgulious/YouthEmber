<template>
  <ion-fab horizontal="end" vertical="bottom" slot="fixed">
    <ion-fab-button class="camera-fab" :disabled="working" @click="capture">
      <ion-icon :icon="cameraOutline" />
    </ion-fab-button>
  </ion-fab>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonFab, IonFabButton, IonIcon } from '@ionic/vue';
import { cameraOutline } from 'ionicons/icons';

import { cameraService } from '../services';
import { useAppStore } from '../store/app-store';

const router = useRouter();
const store = useAppStore();
const working = ref(false);

async function capture(): Promise<void> {
  working.value = true;

  try {
    const asset = await cameraService.takePhoto();
    if (!asset) {
      return;
    }

    store.primeComposerAssets([asset]);
    await router.push('/tabs/new');
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '拍摄失败');
  } finally {
    working.value = false;
  }
}
</script>

<style scoped>
.camera-fab {
  --background: #7a5b3e;
  --box-shadow: 0 8px 20px rgba(95, 73, 48, 0.28);
  --color: #fff8ef;
}
</style>
