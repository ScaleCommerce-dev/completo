<script setup lang="ts">
/**
 * The one control that opens a view's settings.
 *
 * All three views — board, list, My Tasks — configure themselves through the same
 * `ViewConfigModal`, but only two of them reached it through the same control.
 * My Tasks hand-rolled its own: `i-lucide-columns-3` labelled "Fields", against
 * `i-lucide-settings` labelled "Settings" in `ViewHeader`. Same dialog, two
 * names, so the third view read as a different kind of thing than the two it is
 * a peer of.
 *
 * The shared piece is this button and not `ViewHeader`, and that is deliberate.
 * `ViewHeader` takes nine project-scoped props — its own comment records that
 * being exactly why `my-tasks.vue` copy-pasted its class string instead of using
 * it — and its `#title` is a view-switcher menu over a project's boards and
 * lists. My Tasks has no project crumb, no sibling views to switch to, and no
 * filters, so mounting it there would mean making six of those props optional to
 * render an empty menu. A view that is a peer in *what it configures* is not
 * automatically a peer in *how it identifies itself*.
 *
 * Icon-only below `sm`, where a labelled button crowds the breadcrumb off the
 * navbar entirely.
 */
defineEmits<{ click: [] }>()
</script>

<template>
  <UTooltip text="View settings">
    <UButton
      icon="i-lucide-settings"
      variant="ghost"
      color="neutral"
      aria-label="View settings"
      label="Settings"
      :ui="{ label: 'max-sm:hidden' }"
      @click="$emit('click')"
    />
  </UTooltip>
</template>
