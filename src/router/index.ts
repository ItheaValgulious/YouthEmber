import { createRouter, createWebHistory } from '@ionic/vue-router';

import AppTabs from '../layouts/AppTabs.vue';
import EventDetailPage from '../pages/EventDetailPage.vue';
import EventFlowPage from '../pages/EventFlowPage.vue';
import MailDetailPage from '../pages/MailDetailPage.vue';
import MyPage from '../pages/MyPage.vue';
import NewPage from '../pages/NewPage.vue';
import TasksPage from '../pages/TasksPage.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/tabs/flow',
    },
    {
      path: '/tabs/',
      component: AppTabs,
      children: [
        {
          path: '',
          redirect: '/tabs/flow',
        },
        {
          path: 'flow',
          component: EventFlowPage,
        },
        {
          path: 'new',
          component: NewPage,
        },
        {
          path: 'tasks',
          component: TasksPage,
        },
        {
          path: 'my',
          component: MyPage,
        },
      ],
    },
    {
      path: '/event/:id',
      component: EventDetailPage,
    },
    {
      path: '/mail/:id',
      component: MailDetailPage,
    },
  ],
});

export default router;
