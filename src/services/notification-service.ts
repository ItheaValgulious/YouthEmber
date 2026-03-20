import { LocalNotifications } from '@capacitor/local-notifications';

import type { AppConfig, EventRecord } from '../types/models';
import { isNativePlatform } from './capacitor/runtime';

type TaskNotificationKind = 'pre' | 'due';

interface TaskNotificationPlan {
  id: number;
  kind: TaskNotificationKind;
  taskId: string;
  title: string;
  body: string;
  at: Date;
}

function parseAlertTime(value: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function hashString(input: string): number {
  let hash = 0;

  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function buildIds(taskId: string): [number, number] {
  const base = (hashString(taskId) % 100_000_000) + 10_000;
  return [base * 10 + 1, base * 10 + 2];
}

function buildAlertDate(taskTime: string, alertTime: string, offsetDays: number): Date {
  const target = new Date(taskTime);
  const { hour, minute } = parseAlertTime(alertTime);
  target.setHours(hour, minute, 0, 0);
  target.setDate(target.getDate() + offsetDays);
  return target;
}

function truncate(value: string, fallback: string, maxLength: number): string {
  const clean = value.trim() || fallback;
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength)}…`;
}

export class NotificationService {
  private initialized = false;

  private listenerAttached = false;

  private openTaskHandler: ((taskId: string) => void) | null = null;

  private webTimers = new Map<number, number>();

  async initialize(onOpenTask: (taskId: string) => void): Promise<void> {
    this.openTaskHandler = onOpenTask;

    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!isNativePlatform() || this.listenerAttached) {
      return;
    }

    this.listenerAttached = true;
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const taskId = String(event.notification.extra?.task_id ?? '').trim();
      if (taskId) {
        this.openTaskHandler?.(taskId);
      }
    });
  }

  private async ensureNativePermission(): Promise<boolean> {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display === 'granted') {
      return true;
    }

    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  }

  private async ensureWebPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    return (await Notification.requestPermission()) === 'granted';
  }

  private clearWebTimer(id: number): void {
    const timer = this.webTimers.get(id);
    if (typeof timer === 'number') {
      window.clearTimeout(timer);
      this.webTimers.delete(id);
    }
  }

  private async showWebNotification(plan: TaskNotificationPlan): Promise<void> {
    const permitted = await this.ensureWebPermission();
    if (!permitted) {
      return;
    }

    const notification = new Notification(plan.title, {
      body: plan.body,
      data: { task_id: plan.taskId, kind: plan.kind },
      tag: `ashdairy-task-${plan.taskId}-${plan.kind}`,
    });

    notification.onclick = () => {
      window.focus();
      this.openTaskHandler?.(plan.taskId);
      notification.close();
    };
  }

  private scheduleWeb(plan: TaskNotificationPlan): void {
    this.clearWebTimer(plan.id);
    const delay = plan.at.getTime() - Date.now();

    if (delay <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      this.webTimers.delete(plan.id);
      void this.showWebNotification(plan);
    }, delay);
    this.webTimers.set(plan.id, timer);
  }

  private buildPlans(task: Pick<EventRecord, 'id' | 'title' | 'raw' | 'time'>, config: Pick<AppConfig, 'pre_alert' | 'alert_time'>): TaskNotificationPlan[] {
    if (!task.time) {
      return [];
    }

    const now = Date.now();
    const [preId, dueId] = buildIds(task.id);
    const title = truncate(task.title, '任务提醒', 48);
    const body = truncate(task.raw, task.title || '点开看看这个任务吧。', 96);
    const plans: TaskNotificationPlan[] = [];

    if (config.pre_alert > 0) {
      const preAt = buildAlertDate(task.time, config.alert_time, -config.pre_alert);
      if (preAt.getTime() > now) {
        plans.push({
          id: preId,
          kind: 'pre',
          taskId: task.id,
          title: `任务将近 · ${title}`,
          body,
          at: preAt,
        });
      }
    }

    const dueAt = buildAlertDate(task.time, config.alert_time, 0);
    if (dueAt.getTime() > now) {
      plans.push({
        id: dueId,
        kind: 'due',
        taskId: task.id,
        title: `今天截止 · ${title}`,
        body,
        at: dueAt,
      });
    }

    return plans;
  }

  async cancelTaskNotifications(taskId: string): Promise<void> {
    const [preId, dueId] = buildIds(taskId);

    if (isNativePlatform()) {
      try {
        await LocalNotifications.cancel({
          notifications: [{ id: preId }, { id: dueId }],
        });
      } catch {
        // ignore cancel errors on native recovery paths
      }
    }

    this.clearWebTimer(preId);
    this.clearWebTimer(dueId);
  }

  async scheduleTaskNotifications(task: Pick<EventRecord, 'id' | 'title' | 'raw' | 'time'>, config: Pick<AppConfig, 'pre_alert' | 'alert_time'>): Promise<void> {
    await this.cancelTaskNotifications(task.id);

    const plans = this.buildPlans(task, config);
    if (!plans.length) {
      return;
    }

    if (isNativePlatform()) {
      const permitted = await this.ensureNativePermission();
      if (!permitted) {
        return;
      }

      await LocalNotifications.schedule({
        notifications: plans.map((plan) => ({
          id: plan.id,
          title: plan.title,
          body: plan.body,
          schedule: {
            at: plan.at,
            allowWhileIdle: true,
          },
          extra: {
            task_id: plan.taskId,
            kind: plan.kind,
          },
          autoCancel: true,
        })),
      });
      return;
    }

    plans.forEach((plan) => {
      this.scheduleWeb(plan);
    });
  }
}

export const notificationService = new NotificationService();
