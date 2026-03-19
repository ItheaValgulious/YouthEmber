import { Geolocation } from '@capacitor/geolocation';

import type { LocationPayload, Tag } from '../types/models';
import { isNativePlatform } from './capacitor/runtime';

export interface CurrentLocationResult {
  payload: LocationPayload;
  label: string;
  accuracy_meters: number | null;
  captured_at: string;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class LocationService {
  async getCurrentLocation(): Promise<CurrentLocationResult> {
    if (isNativePlatform()) {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
        await Geolocation.requestPermissions();
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 30_000,
    });

    const payload: LocationPayload = {
      country: null,
      province: null,
      city: null,
      district: null,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    return {
      payload,
      label: this.formatLabel(payload),
      accuracy_meters: position.coords.accuracy ?? null,
      captured_at: new Date(position.timestamp).toISOString(),
    };
  }

  formatLabel(payload: LocationPayload): string {
    if (payload.city) {
      return payload.city;
    }

    if (payload.latitude == null || payload.longitude == null) {
      return '当前位置';
    }

    return `位置 ${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}`;
  }

  buildLocationTag(location: CurrentLocationResult): Tag {
    return {
      id: randomId('tag'),
      label: location.label,
      type: 'location',
      rules: '采集自设备当前位置',
      payload: { ...location.payload },
      system: false,
      last_used_at: location.captured_at,
    };
  }
}

export const locationService = new LocationService();
