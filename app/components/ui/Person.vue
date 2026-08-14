<script setup lang="ts">
/**
 * An avatar beside a name. Nine call sites reimplemented this, two of them
 * (`ListCellAssignee` and `ListCellCreator`) character-for-character identical
 * apart from the fallback word, and avatar sizes ranged across 3xs/2xs/xs/sm/md.
 *
 * It also fixes a real bug: every one of those sites passed `:alt` but never
 * `:src`, so list and sidebar avatars always fell back to initials even for users
 * who had uploaded one.
 *
 * When there is nobody, this renders an em-dash rather than the words
 * "Unassigned" / "Unknown" / "N/A". Ten rows of "Unassigned" down a column is
 * noise about data that isn't there — the due-date column already got this right.
 */
withDefaults(defineProps<{
  person?: { id?: string, name: string, avatarUrl?: string | null } | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md'
  /** Overrides the em-dash where a word genuinely reads better. */
  emptyLabel?: string
  /** Emphasises the name — for headers rather than table cells. */
  strong?: boolean
  /**
   * Holds the em-dash back until the row is hovered or focused. For scan columns,
   * where a full column of dashes is noise about data that isn't there — see
   * `EMPTY_CELL_CLASS`. Needs an ancestor carrying `group`.
   */
  emptyOnHover?: boolean
}>(), {
  size: '3xs'
})
</script>

<template>
  <span
    v-if="person"
    class="inline-flex items-center gap-1.5 min-w-0"
  >
    <UiAvatar
      :src="person.avatarUrl"
      :alt="person.name"
      :size="size"
      class="shrink-0"
    />
    <span
      class="truncate text-sm"
      :class="strong ? 'font-semibold text-default' : 'text-muted'"
    >{{ person.name }}</span>
  </span>

  <span
    v-else
    :class="emptyOnHover && !emptyLabel ? EMPTY_CELL_CLASS : 'text-dimmed text-sm'"
  >{{ emptyLabel || '—' }}</span>
</template>
