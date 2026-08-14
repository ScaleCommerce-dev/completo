<script setup lang="ts">
/**
 * The small uppercase heading above a group of fields or a list.
 *
 * There were five spellings of this one style — 11px semibold at 0.04em, 11px
 * semibold at 0.08em, 12px bold at 0.08em, 13px bold at 0.08em, and 11px semibold
 * with tracking-wide — so the same label rendered at three sizes and two weights
 * depending on which screen you were looking at.
 *
 * `count` renders a tabular figure after the label; `rule` extends a hairline
 * across the remaining width, which is how the notification groups read.
 */
withDefaults(defineProps<{
  label?: string
  icon?: string
  count?: number | string | null
  rule?: boolean
}>(), {
  count: null
})
</script>

<template>
  <div class="flex items-center gap-2 min-w-0">
    <span class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-dimmed shrink-0">
      <UIcon
        v-if="icon"
        :name="icon"
        class="text-sm"
      />
      <slot>{{ label }}</slot>
    </span>

    <!-- `border-t border-default`, not `h-px bg-border`: there is no
         `--color-border` token in this app, so `bg-border` resolved to nothing and
         this hairline has never been drawn. It went unnoticed because `rule` has
         zero call sites — the same trap `useTextDraft` fell into, which is why
         CLAUDE.md counts call sites. Hairlines are borders here, everywhere else. -->
    <div
      v-if="rule"
      class="flex-1 border-t border-default"
    />

    <span
      v-if="count !== null && count !== undefined"
      class="text-xs font-mono tabular-nums text-dimmed shrink-0"
    >{{ count }}</span>

    <slot name="actions" />
  </div>
</template>
