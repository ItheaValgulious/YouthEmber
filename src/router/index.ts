import { createRouter, createWebHistory } from '@ionic/vue-router';

import { isAuthGateBootstrapped, isAuthGateSkippedForSession } from '../auth/auth-gate';
import AppTabs from '../layouts/AppTabs.vue';
import AuthGatePage from '../pages/AuthGatePage.vue';
import EventDetailPage from '../pages/EventDetailPage.vue';
import EventFlowPage from '../pages/EventFlowPage.vue';
import MailDetailPage from '../pages/MailDetailPage.vue';
import MyPage from '../pages/MyPage.vue';
import NewPage from '../pages/NewPage.vue';
import TasksPage from '../pages/TasksPage.vue';
import { useAppStore } from '../store/app-store';

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
      path: '/auth',
      component: AuthGatePage,
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

router.beforeEach((to) => {
  if (!isAuthGateBootstrapped()) {
    return true;
  }

  const store = useAppStore();
  const hasSession = store.hasActiveSession();

  if (to.path === '/auth') {
    return hasSession ? '/tabs/flow' : true;
  }

  if (!hasSession && !isAuthGateSkippedForSession()) {
    return '/auth';
  }

  return true;
});

export default router;
