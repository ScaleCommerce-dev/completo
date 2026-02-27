<script setup lang="ts">
interface ProfileProject {
  id: string
  name: string
  slug: string
  key: string
  icon: string | null
  role: string
  openCards: number
}

interface PriorityCounts {
  urgent: number
  high: number
  medium: number
  low: number
}

defineProps<{
  profileData: {
    createdAt: string | null
    lastSeenAt: string | null
    priorityCounts: Record<string, number>
    totalOpen: number
    projects: ProfileProject[]
  }
}>()

function accentFor(project: ProfileProject): string {
  return ACCENT_COLORS[hashCode(project.id || project.name) % ACCENT_COLORS.length]!
}
</script>

<template>
  <div class="mt-6 rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">
    <div class="px-5 pt-4 pb-2">
      <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Activity</span>
    </div>

    <!-- Priority breakdown -->
    <div class="px-5 pt-2 pb-4">
      <div class="flex items-baseline gap-2 mb-3">
        <span class="text-[28px] font-extrabold tracking-[-0.03em] text-zinc-900 dark:text-zinc-100 leading-none">{{ profileData.totalOpen }}</span>
        <span class="text-[13px] font-medium text-zinc-400 dark:text-zinc-500">open {{ profileData.totalOpen === 1 ? 'card' : 'cards' }} assigned</span>
      </div>

      <!-- Stacked bar -->
      <div
        v-if="profileData.totalOpen > 0"
        class="h-2 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-700/50 mb-3"
      >
        <div
          v-if="profileData.priorityCounts.urgent"
          class="h-full transition-all duration-500"
          :style="{ width: `${(profileData.priorityCounts.urgent / profileData.totalOpen) * 100}%`, backgroundColor: '#ef4444' }"
        />
        <div
          v-if="profileData.priorityCounts.high"
          class="h-full transition-all duration-500"
          :style="{ width: `${(profileData.priorityCounts.high / profileData.totalOpen) * 100}%`, backgroundColor: '#f97316' }"
        />
        <div
          v-if="profileData.priorityCounts.medium"
          class="h-full transition-all duration-500"
          :style="{ width: `${(profileData.priorityCounts.medium / profileData.totalOpen) * 100}%`, backgroundColor: '#6366f1' }"
        />
        <div
          v-if="profileData.priorityCounts.low"
          class="h-full transition-all duration-500"
          :style="{ width: `${(profileData.priorityCounts.low / profileData.totalOpen) * 100}%`, backgroundColor: '#94a3b8' }"
        />
      </div>

      <!-- Priority legend chips -->
      <div class="flex flex-wrap gap-2">
        <div
          v-for="p in [
            { key: 'urgent', label: 'Urgent', color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-600 dark:text-red-400' },
            { key: 'high', label: 'High', color: '#f97316', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400' },
            { key: 'medium', label: 'Medium', color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-600 dark:text-indigo-400' },
            { key: 'low', label: 'Low', color: '#94a3b8', bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-600 dark:text-slate-400' }
          ]"
          :key="p.key"
          class="flex items-center gap-1.5 px-2 py-1 rounded-md"
          :class="p.bg"
        >
          <UIcon
            :name="priorityIcon(p.key)"
            class="text-[15px] shrink-0"
          />
          <span
            class="text-[12px] font-semibold tabular-nums"
            :class="p.text"
          >
            {{ (profileData.priorityCounts as unknown as PriorityCounts)[p.key as keyof PriorityCounts] || 0 }}
          </span>
          <span class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{{ p.label }}</span>
        </div>
      </div>
    </div>

    <!-- Projects section -->
    <div
      v-if="profileData.projects?.length"
      class="border-t border-zinc-100 dark:border-zinc-700/40"
    >
      <div class="px-5 pt-3 pb-1">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Projects</span>
      </div>
      <div class="px-5 pb-4 pt-1 space-y-1">
        <NuxtLink
          v-for="project in profileData.projects"
          :key="project.id"
          :to="`/projects/${project.slug}`"
          class="group flex items-center gap-3 px-3 py-2.5 -mx-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
        >
          <div
            class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
          >
            <UIcon
              :name="`i-lucide-${project.icon || 'folder'}`"
              class="text-[15px]"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{{ project.name }}</span>
              <span
                class="font-mono text-[8px] font-bold px-1 py-0.5 rounded tracking-wide shrink-0"
                :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
              >{{ project.key }}</span>
            </div>
            <span class="text-[11px] text-zinc-400 dark:text-zinc-500">{{ project.openCards }} open {{ project.openCards === 1 ? 'card' : 'cards' }}</span>
          </div>
          <span
            class="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full shrink-0"
            :class="project.role === 'owner'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
          >{{ project.role }}</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="text-[14px] text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 dark:group-hover:text-zinc-500 transition-colors shrink-0"
          />
        </NuxtLink>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="profileData.totalOpen === 0 && !profileData.projects?.length"
      class="px-5 pb-4"
    >
      <div class="flex items-center gap-2 text-[13px] text-zinc-400 dark:text-zinc-500">
        <UIcon
          name="i-lucide-inbox"
          class="text-[15px]"
        />
        <span>No project memberships yet</span>
      </div>
    </div>
  </div>
</template>
