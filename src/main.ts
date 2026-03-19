import { createApp } from 'vue';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { initializeAppStore } from './store/app-store';

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

Promise.all([router.isReady(), initializeAppStore()]).then(() => {
  app.mount('#app');
});
