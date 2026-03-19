import { Capacitor } from '@capacitor/core';

export function getCapacitorPlatform(): string {
  return Capacitor.getPlatform();
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isWebPlatform(): boolean {
  return getCapacitorPlatform() === 'web';
}

export function toWebViewPath(uri: string): string {
  return isNativePlatform() ? Capacitor.convertFileSrc(uri) : uri;
}
