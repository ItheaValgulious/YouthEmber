<template>
  <ion-page>
    <ion-content fullscreen>
      <div class="content-wrap auth-gate-wrap">
        <section class="paper-sheet auth-gate-sheet">
          <div class="paper-stack auth-gate-stack">
            <div class="auth-gate-hero">
              <div class="ink-label handwritten">AI Entry</div>
              <h1 class="ink-title auth-gate-title">先登录，再决定是否启用 AI</h1>
              <p class="auth-gate-copy">
                登录或注册后，才能使用 AI 标题补全、朋友评论和总结邮件。你也可以先跳过，继续只写本地日记。
              </p>
            </div>

            <div class="preview-card auth-gate-card">
              <div class="paper-stack">
                <div class="auth-gate-mode">
                  <ion-button :fill="mode === 'signin' ? 'solid' : 'outline'" @click="mode = 'signin'">登录</ion-button>
                  <ion-button :fill="mode === 'signup' ? 'solid' : 'outline'" @click="mode = 'signup'">注册</ion-button>
                </div>

                <label>
                  <div class="section-title">用户名</div>
                  <input v-model="username" class="native-input" autocomplete="username" />
                </label>

                <label>
                  <div class="section-title">密码</div>
                  <input
                    v-model="password"
                    class="native-input"
                    :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
                    type="password"
                  />
                </label>

                <div class="row wrap">
                  <ion-button :disabled="busy || !serverConfigured" @click="submit">
                    {{ mode === 'signin' ? '登录并继续' : '注册并继续' }}
                  </ion-button>
                  <ion-button fill="outline" :disabled="busy" @click="skip">
                    跳过，先本地使用
                  </ion-button>
                </div>

                <div class="empty-note auth-gate-note">
                  跳过后仍然可以写日记、看事件和导出数据，但不会有 AI 标题、AI 评论和 Summary。
                </div>

                <div v-if="!serverConfigured" class="empty-note">
                  当前还没有配置服务端地址，所以现在只能先跳过本地使用。
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonContent, IonPage } from '@ionic/vue';
import { useRouter } from 'vue-router';

import { resetAuthGateSkip, skipAuthGateForSession } from '../auth/auth-gate';
import { serverService } from '../services';
import { useAppStore } from '../store/app-store';

const router = useRouter();
const store = useAppStore();

const mode = ref<'signin' | 'signup'>('signin');
const username = ref('');
const password = ref('');
const busy = ref(false);
const serverConfigured = serverService.isConfigured();

async function submit(): Promise<void> {
  busy.value = true;
  try {
    if (mode.value === 'signin') {
      await store.signin(username.value, password.value);
    } else {
      await store.signup(username.value, password.value);
    }
    resetAuthGateSkip();
    password.value = '';
    await router.replace('/tabs/flow');
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '认证失败');
  } finally {
    busy.value = false;
  }
}

async function skip(): Promise<void> {
  skipAuthGateForSession();
  await router.replace('/tabs/flow');
}
</script>

<style scoped>
.auth-gate-wrap {
  min-height: 100vh;
  display: grid;
  align-items: center;
}

.auth-gate-sheet {
  padding: 28px;
}

.auth-gate-stack {
  gap: 24px;
}

.auth-gate-hero {
  display: grid;
  gap: 10px;
}

.auth-gate-title {
  max-width: 18ch;
}

.auth-gate-copy {
  max-width: 42rem;
  margin: 0;
  color: var(--ink-soft);
  line-height: 1.7;
}

.auth-gate-card {
  padding: 18px;
  max-width: 560px;
}

.auth-gate-mode {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.auth-gate-note {
  line-height: 1.7;
}

@media (max-width: 760px) {
  .auth-gate-sheet {
    padding: 20px;
  }

  .auth-gate-title {
    max-width: none;
  }
}
</style>
