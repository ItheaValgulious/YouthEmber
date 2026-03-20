import { Geolocation } from '@capacitor/geolocation';

import type { LocationPayload, Tag } from '../types/models';
import { isNativePlatform } from './capacitor/runtime';

export interface CurrentLocationResult {
  payload: LocationPayload;
  label: string;
  accuracy_meters: number | null;
  captured_at: string;
}

interface ReverseGeocodeResponse {
  address?: Record<string, string | undefined>;
  display_name?: string;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class LocationService {
  private async reverseGeocode(latitude: number, longitude: number): Promise<Partial<LocationPayload> & { label?: string }> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'zh-CN');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`位置反查失败（${response.status}）`);
    }

    const payload = (await response.json()) as ReverseGeocodeResponse;
    const address = payload.address ?? {};

    return {
      country: address.country ?? null,
      province: address.state ?? address.region ?? null,
      city: address.city ?? address.town ?? address.village ?? address.county ?? null,
      district:
        address.city_district ??
        address.district ??
        address.suburb ??
        address.quarter ??
        address.neighbourhood ??
        null,
      label:
        address.city ??
        address.town ??
        address.village ??
        address.county ??
        payload.display_name ??
        undefined,
    };
  }

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
    let label = this.formatLabel(payload);

    try {
      const reversePayload = await this.reverseGeocode(position.coords.latitude, position.coords.longitude);
      payload.country = reversePayload.country ?? payload.country;
      payload.province = reversePayload.province ?? payload.province;
      payload.city = reversePayload.city ?? payload.city;
      payload.district = reversePayload.district ?? payload.district;
      label = reversePayload.label?.trim() || this.formatLabel(payload);
    } catch {
      label = this.formatLabel(payload);
    }

    return {
      payload,
      label,
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
