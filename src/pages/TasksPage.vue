<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>Tasks</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap card-stack">
        <ion-card class="sketch-card">
          <ion-card-header>
            <ion-card-title>新建 Task</ion-card-title>
          </ion-card-header>
          <ion-card-content class="card-stack">
            <textarea
              v-model="draft"
              class="native-textarea"
              placeholder="写下要做的事。"
            />

            <label>
              <div class="section-title">截止时间</div>
              <input v-model="dueAt" class="native-input" type="datetime-local" />
            </label>

            <ion-button @click="createTask">
              创建 Task
            </ion-button>
          </ion-card-content>
        </ion-card>

        <div class="section-title">进行中的任务</div>

        <EventCard
          v-for="task in store.ongoingTasks.value"
          :key="task.id"
          :event="task"
          @complete="store.completeTask"
          @fail="store.failTask"
        />

        <div v-if="!store.ongoingTasks.value.length" class="empty-note">
          当前没有进行中的任务。
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import EventCard from '../components/EventCard.vue';
import { fromDateTimeLocalValue } from '../lib/date';
import { useAppStore } from '../store/app-store';

const store = useAppStore();
const draft = ref('');
const dueAt = ref('');

function createTask(): void {
  const created = store.createTaskFromText(draft.value, fromDateTimeLocalValue(dueAt.value));
  if (!created) {
    window.alert('请先输入任务内容。');
    return;
  }

  draft.value = '';
  dueAt.value = '';
}
</script>
