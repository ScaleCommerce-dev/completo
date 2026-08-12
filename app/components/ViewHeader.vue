<script setup lang="ts">
/**
 * The board/list page shell.
 *
 * This was the app's only shared page header, but it hardcoded a project
 * breadcrumb and took nine required props — so `my-tasks.vue` and
 * `notifications.vue` copy-pasted its class string verbatim rather than use it.
 * It is now a thin specialisation of `UiPage`: the breadcrumb and view switcher
 * go in the `#title` slot, and the global chrome (notifications, search) comes
 * from UiPage for free.
 */
interface ViewSwitcherItem {
  label: string
  icon: string
  disabled?: boolean
  onSelect: () => void
}

const props = defineProps<{
  projectName: string
  projectSlug: string
  viewName: string
  viewIcon: string
  viewSwitcherItems: ViewSwitcherItem[][]
  cardCount: number
  activeFilterCount: number
  filterSummary: string
  canConfigure: boolean
}>()

defineEmits<{
  'open-settings': []
}>()

useSeoMeta({
  title: () => `${props.viewName} · ${props.projectName} · Completo`
})
</script>

<template>
  <UiPage variant="surface">
    <template #title>
      <nav class="flex items-center gap-1.5 text-sm min-w-0">
        <!-- The project crumb is the first thing to go on a narrow screen: the
             view name identifies where you are, the project is context. -->
        <NuxtLink
          :to="`/projects/${projectSlug}`"
          class="flex items-center gap-1.5 text-muted hover:text-default transition-colors min-w-0 max-md:hidden"
        >
          <UIcon
            name="i-lucide-folder"
            class="size-4 shrink-0"
          />
          <span class="truncate max-w-40">{{ projectName }}</span>
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 text-dimmed shrink-0 max-md:hidden"
        />
        <UDropdownMenu :items="viewSwitcherItems">
          <button
            type="button"
            class="group/name flex items-center gap-1.5 font-bold tracking-[-0.01em] text-highlighted cursor-pointer hover:text-primary transition-colors min-w-0"
            aria-label="Switch view"
          >
            <UIcon
              :name="viewIcon"
              class="size-4 shrink-0 text-dimmed"
            />
            <span class="truncate max-w-60">{{ viewName }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 text-dimmed shrink-0 opacity-40 group-hover/name:opacity-100 transition-opacity"
            />
          </button>
        </UDropdownMenu>
      </nav>
    </template>

    <template #meta>
      <UTooltip :text="activeFilterCount > 0 ? `${cardCount} of the project's cards match this view` : `${cardCount} cards`">
        <UBadge
          :label="String(cardCount)"
          icon="i-lucide-layers"
          color="neutral"
          variant="subtle"
          :ui="{ label: 'font-mono tabular-nums' }"
        />
      </UTooltip>

      <UTooltip
        v-if="activeFilterCount > 0"
        :text="filterSummary"
      >
        <UButton
          :label="`${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'}`"
          icon="i-lucide-filter"
          color="primary"
          variant="subtle"
          @click="$emit('open-settings')"
        />
      </UTooltip>
    </template>

    <template #actions>
      <slot name="actions" />
      <!-- Icon-only below `sm`, where a labelled button would crowd the
           breadcrumb off the navbar entirely. -->
      <UTooltip text="View settings">
        <UButton
          v-if="canConfigure"
          icon="i-lucide-settings"
          variant="ghost"
          color="neutral"
          aria-label="View settings"
          :ui="{ label: 'max-sm:hidden' }"
          label="Settings"
          @click="$emit('open-settings')"
        />
      </UTooltip>
    </template>

    <slot />
  </UiPage>
</template>
