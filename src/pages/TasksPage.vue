<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>{{ ui.t('app_tasks') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="content-wrap desk-stack">
        <section class="paper-sheet tasks-composer">
          <div class="tasks-composer__head">
            <div class="ink-label handwritten">{{ ui.t('todo_slip') }}</div>
            <h2 class="ink-title">{{ ui.t('create_task') }}</h2>
          </div>

          <div class="tasks-composer__body">
            <textarea
              v-model="draft"
              class="native-textarea"
              :placeholder="ui.t('entry_placeholder')"
            />

            <label>
              <div class="section-title">{{ ui.t('due_time') }}</div>
              <input v-model="dueAt" class="native-input" type="datetime-local" />
            </label>

            <ion-button @click="createTask">{{ ui.t('create_task') }}</ion-button>
          </div>
        </section>

        <section class="tasks-board">
          <div class="tasks-board__head row between wrap">
            <div>
              <div class="ink-label handwritten">{{ ui.t('active_slips') }}</div>
              <h2 class="ink-title">{{ ui.t('ongoing_tasks') }}</h2>
            </div>

            <div class="tasks-board__count handwritten">
              {{ ui.t('open_count', { count: store.ongoingTasks.value.length }) }}
            </div>
          </div>

          <div v-if="store.ongoingTasks.value.length" class="tasks-board__list">
            <EventCard
              v-for="task in store.ongoingTasks.value"
              :key="task.id"
              :event="task"
              @complete="store.completeTask"
              @fail="store.failTask"
            />
          </div>

          <div v-else class="empty-note">
            {{ ui.t('no_ongoing_tasks') }}
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';

import EventCard from '../components/EventCard.vue';
import { fromDateTimeLocalValue } from '../lib/date';
import { useAppStore } from '../store/app-store';
import { useUiPreferences } from '../ui/preferences';

const store = useAppStore();
const ui = useUiPreferences();
const draft = ref('');
const dueAt = ref('');

async function createTask(): Promise<void> {
  const created = await store.createTaskFromText(draft.value, fromDateTimeLocalValue(dueAt.value));
  if (!created) {
    window.alert(ui.t('enter_task_content_first'));
    return;
  }

  draft.value = '';
  dueAt.value = '';
}
</script>

<style scoped>
.tasks-composer,
.tasks-board {
  padding: 24px;
}

.tasks-composer__body {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.tasks-board__head {
  align-items: end;
  gap: 18px;
  margin-bottom: 18px;
}

.tasks-board__count {
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 247, 230, 0.88);
  border: 1px solid rgba(118, 89, 57, 0.14);
  color: #6d5136;
}

.tasks-board__list {
  display: grid;
  gap: 18px;
}

@media (max-width: 760px) {
  .tasks-composer,
  .tasks-board {
    padding: 18px 16px;
  }

  .tasks-composer__body {
    gap: 12px;
    margin-top: 14px;
  }

  .tasks-board__head {
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .tasks-board__count {
    padding: 8px 12px;
  }

  .tasks-board__list {
    gap: 14px;
  }
}
</style>
