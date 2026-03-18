<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/my" />
        </ion-buttons>
        <ion-title>Mail</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap">
        <ion-card v-if="mail" class="sketch-card">
          <ion-card-header>
            <ion-card-title>{{ mail.title }}</ion-card-title>
            <ion-card-subtitle>{{ store.formatDateTime(mail.time) }} · {{ mail.sender }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <iframe
              class="mail-frame"
              sandbox="allow-scripts"
              :srcdoc="mail.content"
              :title="mail.title"
            />
          </ion-card-content>
        </ion-card>

        <div v-else class="empty-note">没找到这封 Mail。</div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import { useAppStore } from '../store/app-store';

const route = useRoute();
const store = useAppStore();

const mail = computed(() => store.getMailById(String(route.params.id)));
</script>
