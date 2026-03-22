<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom" class="sketch-tabbar">
        <ion-tab-button tab="flow" href="/tabs/flow">
          <ion-icon :icon="listCircleOutline" />
          <ion-label>{{ ui.t('app_flow') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="new" href="/tabs/new">
          <ion-icon :icon="addCircleOutline" />
          <ion-label>{{ ui.t('app_new') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="tasks" href="/tabs/tasks">
          <ion-icon :icon="checkboxOutline" />
          <ion-label>{{ ui.t('app_tasks') }}</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="my" href="/tabs/my">
          <ion-icon :icon="personCircleOutline" />
          <ion-label>{{ ui.t('app_my') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/vue';
import { addCircleOutline, checkboxOutline, listCircleOutline, personCircleOutline } from 'ionicons/icons';

import { useUiPreferences } from '../ui/preferences';

const ui = useUiPreferences();
</script>
