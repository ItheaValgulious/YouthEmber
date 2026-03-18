import type { Tag } from '../types/models';

const priorityMap: Record<Tag['type'], number> = {
  mood: 5,
  others: 4,
  people: 3,
  nature: 2,
  location: 1,
};

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function tagKey(tag: Pick<Tag, 'label' | 'type'>): string {
  return `${tag.type}:${normalizeLabel(tag.label)}`;
}

export function dedupeTags(tags: Tag[]): Tag[] {
  const seen = new Map<string, Tag>();

  tags.forEach((tag) => {
    const key = tagKey(tag);
    if (!seen.has(key)) {
      seen.set(key, {
        ...tag,
        payload: tag.payload ? { ...tag.payload } : null,
      });
    }
  });

  return [...seen.values()];
}

export function hasTagLabel(tags: Tag[], label: string): boolean {
  const target = normalizeLabel(label);
  return tags.some((tag) => normalizeLabel(tag.label) === target);
}

export function sortTagsForDisplay(tags: Tag[]): Tag[] {
  return [...tags].sort((left, right) => {
    const typeDelta = priorityMap[right.type] - priorityMap[left.type];
    if (typeDelta !== 0) {
      return typeDelta;
    }

    const timeDelta =
      new Date(right.last_used_at ?? 0).getTime() - new Date(left.last_used_at ?? 0).getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return left.label.localeCompare(right.label, 'zh-CN');
  });
}

export function mergeTagCatalog(existing: Tag[], incoming: Tag[], time: string): Tag[] {
  const merged = [...existing];

  incoming.forEach((tag) => {
    const found = merged.find((item) => tagKey(item) === tagKey(tag));
    if (found) {
      found.last_used_at = time;
      return;
    }

    merged.push({
      ...tag,
      payload: tag.payload ? { ...tag.payload } : null,
      last_used_at: time,
    });
  });

  return merged;
}

