import { createApp } from 'vue';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import { markAuthGateBootstrapped } from './auth/auth-gate';
import router from './router';
import { initializeAppStore } from './store/app-store';
import { useAppStore } from './store/app-store';
import { databaseService, notificationService } from './services';
import { initializeUiPreferences } from './ui/preferences';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

import './theme/variables.css';
import './theme/app.css';

const app = createApp(App);

app.use(IonicVue);
app.use(router);

async function bootstrap(): Promise<void> {
  await databaseService.initialize();
  await Promise.all([router.isReady(), initializeAppStore(), initializeUiPreferences()]);
  markAuthGateBootstrapped();

  const hasSession = useAppStore().hasActiveSession();
  const currentPath = router.currentRoute.value.path;

  if (hasSession && currentPath === '/auth') {
    await router.replace('/tabs/flow');
  } else if (!hasSession && currentPath !== '/auth') {
    await router.replace('/auth');
  }

  void notificationService.initialize((taskId) => {
    router.push(`/event/${taskId}`);
  });
  app.mount('#app');
}

bootstrap().catch((error) => {
  console.error('Application bootstrap failed.', error);
});
