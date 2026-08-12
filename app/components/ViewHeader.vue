<script setup lang="ts">
interface ViewSwitcherItem {
  label: string
  icon: string
  disabled?: boolean
  onSelect: () => void
}

defineProps<{
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
</script>

<template>
  <div class="flex items-center justify-between px-5 py-2.5 border-b border-default bg-default/60 backdrop-blur-sm">
    <div class="flex items-center gap-3">
      <nav class="flex items-center gap-1.5 text-sm">
        <NuxtLink
          :to="`/projects/${projectSlug}`"
          class="flex items-center gap-1 text-muted hover:text-default transition-colors"
        >
          <UIcon
            name="i-lucide-folder"
            class="size-4 shrink-0"
          />
          <span class="truncate max-w-40">{{ projectName }}</span>
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 text-dimmed shrink-0"
        />
        <UDropdownMenu :items="viewSwitcherItems">
          <button
            type="button"
            class="group/name flex items-center gap-1 font-medium text-highlighted cursor-pointer hover:text-primary transition-colors"
          >
            <UIcon
              :name="viewIcon"
              class="size-4 shrink-0 text-dimmed"
            />
            <span class="truncate max-w-60">{{ viewName }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 text-dimmed opacity-0 group-hover/name:opacity-100 transition-opacity"
            />
          </button>
        </UDropdownMenu>
      </nav>
      <UTooltip :text="activeFilterCount > 0 ? 'Filtered cards' : 'All cards'">
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums"
          :class="cardCount > 0
            ? 'text-muted bg-elevated'
            : 'text-dimmed bg-muted'"
        >
          <UIcon
            name="i-lucide-layers"
            class="size-3.5"
          />
          {{ cardCount }}
        </span>
      </UTooltip>

      <slot name="actions" />
    </div>

    <div class="flex items-center gap-2">
      <!-- Active filter indicator -->
      <UTooltip
        v-if="activeFilterCount > 0"
        :text="filterSummary"
      >
        <button
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-mono tabular-nums text-primary bg-primary/10 hover:bg-primary/15 transition-colors cursor-pointer"
          @click="$emit('open-settings')"
        >
          <UIcon
            name="i-lucide-filter"
            class="size-3.5"
          />
          {{ activeFilterCount }} {{ activeFilterCount === 1 ? 'filter' : 'filters' }}
        </button>
      </UTooltip>

      <NotificationBell />
      <button
        v-if="canConfigure"
        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-dimmed hover:text-toned hover:bg-elevated transition-all"
        @click="$emit('open-settings')"
      >
        <UIcon
          name="i-lucide-settings"
          class="text-sm"
        />
        Settings
      </button>
    </div>
  </div>
</template>
