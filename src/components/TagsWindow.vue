<template>
  <ion-modal :is-open="open" @didDismiss="emit('cancel')">
    <ion-header translucent>
      <ion-toolbar>
        <ion-title>{{ mode === 'create' ? '选择标签' : '筛选标签' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="emit('cancel')">取消</ion-button>
          <ion-button @click="apply">确定</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <div class="tags-window">
        <section class="tags-window__selected">
          <div class="section-title">已选择</div>
          <div v-if="selectedTags.length" class="tag-row">
            <button
              v-for="tag in selectedTags"
              :key="`${tag.type}:${tag.label}`"
              class="tag-chip is-selected"
              @click="toggleTag(tag)"
            >
              {{ tag.label }}
            </button>
          </div>
          <div v-else class="empty-note">还没有选中标签。</div>
        </section>

        <section v-if="mode === 'create'" class="tags-window__location">
          <label class="row between">
            <span class="section-title" style="margin: 0;">携带当前位置</span>
            <input :checked="localLocationEnabled" type="checkbox" @change="toggleLocation" />
          </label>
          <div class="muted">
            {{ currentLocationLabel || '未获取当前位置，提交时会再尝试一次。' }}
          </div>
        </section>

        <section class="tags-window__body">
          <div class="tags-window__categories">
            <button
              v-for="category in visibleCategories"
              :key="category"
              class="tag-chip tags-window__category"
              :class="{ 'is-selected': activeCategory === category }"
              @click="selectCategory(category)"
            >
              {{ categoryLabels[category] }}
            </button>
          </div>

          <div class="tags-window__list">
            <template v-if="mode === 'filter' && activeCategory === 'location'">
              <div class="card-stack">
                <div class="tags-window__filter-grid">
                  <select class="native-select" :value="locationFilter.country" @change="updateLocationFilter('country', $event)">
                    <option value="">国家</option>
                    <option v-for="item in countryOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select class="native-select" :value="locationFilter.province" @change="updateLocationFilter('province', $event)">
                    <option value="">省份</option>
                    <option v-for="item in provinceOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select class="native-select" :value="locationFilter.city" @change="updateLocationFilter('city', $event)">
                    <option value="">城市</option>
                    <option v-for="item in cityOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                  <select class="native-select" :value="locationFilter.district" @change="updateLocationFilter('district', $event)">
                    <option value="">区县</option>
                    <option v-for="item in districtOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                </div>

                <div v-if="filteredLocationTags.length" class="tag-row">
                  <button
                    v-for="tag in filteredLocationTags"
                    :key="`${tag.type}:${tag.label}`"
                    class="tag-chip"
                    :class="{ 'is-selected': localSelectedKeys.includes(tagKey(tag)) }"
                    @click="toggleTag(tag)"
                  >
                    {{ tag.label }}
                  </button>
                </div>
                <div v-else class="empty-note">当前筛选条件下没有位置标签。</div>
              </div>
            </template>

            <template v-else>
              <div v-if="visibleTags.length" class="tag-row">
                <button
                  v-for="tag in visibleTags"
                  :key="`${tag.type}:${tag.label}`"
                  class="tag-chip"
                  :class="{ 'is-selected': localSelectedKeys.includes(tagKey(tag)) }"
                  @click="toggleTag(tag)"
                >
                  {{ tag.label }}
                </button>
              </div>
              <div v-else class="empty-note">当前分类还没有可选标签。</div>
            </template>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';

import type { LocationPayload, Tag, TagType } from '../types/models';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode: 'create' | 'filter';
    tags: Tag[];
    selectedKeys: string[];
    locationEnabled?: boolean;
    currentLocationLabel?: string;
    defaultLocationPayload?: LocationPayload | null;
  }>(),
  {
    locationEnabled: true,
    currentLocationLabel: '',
    defaultLocationPayload: null,
  },
);

const emit = defineEmits<{
  cancel: [];
  apply: [payload: { selectedKeys: string[]; locationEnabled: boolean }];
}>();

const categoryLabels: Record<TagType, string> = {
  nature: 'Nature',
  mood: 'Mood',
  others: 'Others',
  people: 'People',
  location: 'Location',
};

const visibleCategories = computed<TagType[]>(() =>
  props.mode === 'create'
    ? ['nature', 'mood', 'others', 'people']
    : ['nature', 'mood', 'others', 'people', 'location'],
);

const activeCategory = ref<TagType>('nature');
const localSelectedKeys = ref<string[]>([]);
const localLocationEnabled = ref(true);
const locationFilter = reactive({
  country: '',
  province: '',
  city: '',
  district: '',
});

function tagKey(tag: Pick<Tag, 'type' | 'label'>): string {
  return `${tag.type}:${tag.label}`;
}

function resetLocalState(): void {
  localSelectedKeys.value = [...props.selectedKeys];
  localLocationEnabled.value = props.locationEnabled;
  activeCategory.value = props.mode === 'filter' ? 'location' : visibleCategories.value[0] ?? 'nature';
  locationFilter.country = props.defaultLocationPayload?.country ?? '';
  locationFilter.province = props.defaultLocationPayload?.province ?? '';
  locationFilter.city = props.defaultLocationPayload?.city ?? '';
  locationFilter.district = props.defaultLocationPayload?.district ?? '';
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetLocalState();
    }
  },
  { immediate: true },
);

const plainTags = computed(() => props.tags.filter((tag) => !tag.system));

const selectedTags = computed(() =>
  plainTags.value.filter((tag) => localSelectedKeys.value.includes(tagKey(tag))),
);

const visibleTags = computed(() =>
  plainTags.value.filter((tag) => tag.type === activeCategory.value),
);

const locationTags = computed(() => plainTags.value.filter((tag) => tag.type === 'location'));

function readLocationField(payload: LocationPayload | null | undefined, field: keyof LocationPayload): string {
  const value = payload?.[field];
  return typeof value === 'string' ? value : '';
}

function uniqueLocationValues(tags: Tag[], field: keyof LocationPayload): string[] {
  return [...new Set(tags.map((tag) => readLocationField(tag.payload, field)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

const countryOptions = computed(() => uniqueLocationValues(locationTags.value, 'country'));
const provinceOptions = computed(() =>
  uniqueLocationValues(
    locationTags.value.filter((tag) => !locationFilter.country || readLocationField(tag.payload, 'country') === locationFilter.country),
    'province',
  ),
);
const cityOptions = computed(() =>
  uniqueLocationValues(
    locationTags.value.filter(
      (tag) =>
        (!locationFilter.country || readLocationField(tag.payload, 'country') === locationFilter.country) &&
        (!locationFilter.province || readLocationField(tag.payload, 'province') === locationFilter.province),
    ),
    'city',
  ),
);
const districtOptions = computed(() =>
  uniqueLocationValues(
    locationTags.value.filter(
      (tag) =>
        (!locationFilter.country || readLocationField(tag.payload, 'country') === locationFilter.country) &&
        (!locationFilter.province || readLocationField(tag.payload, 'province') === locationFilter.province) &&
        (!locationFilter.city || readLocationField(tag.payload, 'city') === locationFilter.city),
    ),
    'district',
  ),
);

const filteredLocationTags = computed(() =>
  locationTags.value.filter((tag) => {
    const payload = tag.payload;
    if (!payload) {
      return !locationFilter.country && !locationFilter.province && !locationFilter.city && !locationFilter.district;
    }

    if (locationFilter.country && readLocationField(payload, 'country') !== locationFilter.country) {
      return false;
    }

    if (locationFilter.province && readLocationField(payload, 'province') !== locationFilter.province) {
      return false;
    }

    if (locationFilter.city && readLocationField(payload, 'city') !== locationFilter.city) {
      return false;
    }

    if (locationFilter.district && readLocationField(payload, 'district') !== locationFilter.district) {
      return false;
    }

    return true;
  }),
);

function selectCategory(category: TagType): void {
  activeCategory.value = category;
}

function toggleTag(tag: Tag): void {
  const key = tagKey(tag);
  if (localSelectedKeys.value.includes(key)) {
    localSelectedKeys.value = localSelectedKeys.value.filter((item) => item !== key);
    return;
  }

  localSelectedKeys.value = [...localSelectedKeys.value, key];
}

function toggleLocation(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  localLocationEnabled.value = Boolean(target?.checked);
}

function updateLocationFilter(field: 'country' | 'province' | 'city' | 'district', event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  locationFilter[field] = target?.value ?? '';

  if (field === 'country') {
    locationFilter.province = '';
    locationFilter.city = '';
    locationFilter.district = '';
  }

  if (field === 'province') {
    locationFilter.city = '';
    locationFilter.district = '';
  }

  if (field === 'city') {
    locationFilter.district = '';
  }
}

function apply(): void {
  emit('apply', {
    selectedKeys: [...localSelectedKeys.value],
    locationEnabled: localLocationEnabled.value,
  });
}
</script>

<style scoped>
.tags-window {
  display: grid;
  gap: 14px;
  padding: 16px 14px calc(96px + env(safe-area-inset-bottom));
}

.tags-window__selected,
.tags-window__location,
.tags-window__list,
.tags-window__categories {
  border: 1px solid rgba(180, 139, 89, 0.45);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  padding: 14px;
}

.tags-window__body {
  display: grid;
  gap: 12px;
  grid-template-columns: 108px minmax(0, 1fr);
}

.tags-window__categories {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.tags-window__category {
  white-space: nowrap;
  text-align: left;
}

.tags-window__filter-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 640px) {
  .tags-window__body {
    grid-template-columns: 88px minmax(0, 1fr);
  }
}
</style>
