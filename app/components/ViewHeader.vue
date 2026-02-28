<script setup lang="ts">
import type { Tag } from '~/types/card'

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
  openCards: number
  activePriorityFilters: Set<string>
  activeTagFilters: Set<string>
  tags: Tag[]
  canConfigure: boolean
}>()

defineEmits<{
  'toggle-priority': [priority: string]
  'open-settings': []
}>()
</script>

<template>
  <div class="flex items-center justify-between px-5 py-2.5 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
    <div class="flex items-center gap-3">
      <nav class="flex items-center gap-1.5 text-sm">
        <NuxtLink
          :to="`/projects/${projectSlug}`"
          class="flex items-center gap-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <UIcon
            name="i-lucide-folder"
            class="size-4 shrink-0"
          />
          <span class="truncate max-w-40">{{ projectName }}</span>
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 text-zinc-300 dark:text-zinc-600 shrink-0"
        />
        <UDropdownMenu :items="viewSwitcherItems">
          <button
            type="button"
            class="group/name flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <UIcon
              :name="viewIcon"
              class="size-4 shrink-0 text-zinc-400"
            />
            <span class="truncate max-w-60">{{ viewName }}</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 text-zinc-400 dark:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-opacity"
            />
          </button>
        </UDropdownMenu>
      </nav>
      <UTooltip text="Open cards">
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono tabular-nums"
          :class="openCards > 0
            ? 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
            : 'text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50'"
        >
          <UIcon
            name="i-lucide-layers"
            class="size-3.5"
          />
          {{ openCards }}
        </span>
      </UTooltip>

      <slot name="actions" />
    </div>

    <div class="flex items-center gap-2">
      <!-- Priority quick-filters -->
      <div class="flex items-center gap-0.5 mr-1.5">
        <button
          v-for="p in ['urgent', 'high', 'medium', 'low']"
          :key="p"
          class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium capitalize transition-all"
          :class="activePriorityFilters.has(p)
            ? ''
            : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
          :style="activePriorityFilters.has(p) ? { color: PRIORITY_COLOR_MAP[p] } : {}"
          @click="$emit('toggle-priority', p)"
        >
          <UIcon
            :name="priorityIcon(p)"
            class="text-[15px]"
          />
          {{ p }}
        </button>
      </div>

      <!-- Active tag filters (read-only) -->
      <div
        v-if="activeTagFilters.size"
        class="flex items-center gap-1 mr-1"
      >
        <span
          v-for="tag in tags.filter(t => activeTagFilters.has(t.id))"
          :key="tag.id"
          class="tag-pill inline-flex items-center px-1.5 py-[3px] rounded-full text-[10.5px] font-bold leading-none tracking-wide uppercase"
          :style="{
            color: tag.color,
            backgroundColor: tag.color + '25',
            boxShadow: `inset 0 0 0 1px ${tag.color}40`
          }"
        >{{ tag.name }}</span>
      </div>

      <NotificationBell />
      <button
        v-if="canConfigure"
        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-all"
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
