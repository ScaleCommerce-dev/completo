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

const props = defineProps<{
  profileData: {
    createdAt: string | null
    lastSeenAt: string | null
    priorityCounts: Record<string, number>
    totalOpen: number
    projects: ProfileProject[]
  }
}>()

function priorityCount(priority: string): number {
  return props.profileData.priorityCounts[priority] || 0
}

function accentFor(project: ProfileProject): string {
  return ACCENT_COLORS[hashCode(project.id || project.name) % ACCENT_COLORS.length]!
}
</script>

<template>
  <div class="mt-6 rounded-xl border border-default bg-default shadow-sm overflow-hidden">
    <div class="px-5 pt-4 pb-2">
      <span class="text-xs font-semibold uppercase tracking-[0.08em] text-dimmed">Activity</span>
    </div>

    <!-- Priority breakdown -->
    <div class="px-5 pt-2 pb-4">
      <div class="flex items-baseline gap-2 mb-3">
        <span class="text-2xl font-extrabold tracking-[-0.03em] text-highlighted leading-none">{{ profileData.totalOpen }}</span>
        <span class="text-sm font-medium text-dimmed">open {{ profileData.totalOpen === 1 ? 'card' : 'cards' }} assigned</span>
      </div>

      <!-- Stacked bar. Fills come from priorityChartClass(), which — unlike the
           chrome elsewhere — keeps all four levels distinguishable, since here
           the colour *is* the data rather than an urgency cue. -->
      <div
        v-if="profileData.totalOpen > 0"
        class="h-2 rounded-full overflow-hidden flex bg-elevated mb-3"
      >
        <div
          v-for="p in PRIORITIES.slice().reverse()"
          v-show="priorityCount(p.value)"
          :key="p.value"
          class="h-full transition-[width] duration-500"
          :class="priorityChartClass(p.value)"
          :style="{ width: `${(priorityCount(p.value) / profileData.totalOpen) * 100}%` }"
        />
      </div>

      <!-- Priority legend chips -->
      <div class="flex flex-wrap gap-2">
        <div
          v-for="p in PRIORITIES.slice().reverse()"
          :key="p.value"
          class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated"
        >
          <UIcon
            :name="p.icon"
            class="text-base shrink-0"
            :class="priorityTextClass(p.value)"
          />
          <span
            class="text-xs font-semibold tabular-nums"
            :class="priorityTextClass(p.value)"
          >
            {{ priorityCount(p.value) }}
          </span>
          <span class="text-xs font-medium text-dimmed">{{ p.label }}</span>
        </div>
      </div>
    </div>

    <!-- Projects section -->
    <div
      v-if="profileData.projects?.length"
      class="border-t border-muted"
    >
      <div class="px-5 pt-3 pb-1">
        <span class="text-xs font-semibold uppercase tracking-[0.08em] text-dimmed">Projects</span>
      </div>
      <div class="px-5 pb-4 pt-1 space-y-1">
        <NuxtLink
          v-for="project in profileData.projects"
          :key="project.id"
          :to="`/projects/${project.slug}`"
          class="group flex items-center gap-3 px-3 py-2.5 -mx-1 rounded-lg hover:bg-muted transition-colors"
        >
          <div
            class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
          >
            <UIcon
              :name="`i-lucide-${project.icon || 'folder'}`"
              class="text-base"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-semibold text-default group-hover:text-primary transition-colors truncate">{{ project.name }}</span>
              <span
                class="font-mono text-2xs font-bold px-1 py-0.5 rounded-md tracking-wide shrink-0"
                :style="{ backgroundColor: accentFor(project) + '14', color: accentFor(project) }"
              >{{ project.key }}</span>
            </div>
            <span class="text-xs text-dimmed">{{ project.openCards }} open {{ project.openCards === 1 ? 'card' : 'cards' }}</span>
          </div>
          <span
            class="text-2xs font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full shrink-0"
            :class="project.role === 'owner'
              ? 'bg-primary/10 text-primary'
              : 'bg-elevated text-muted'"
          >{{ project.role }}</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="text-base text-dimmed group-hover:text-dimmed transition-colors shrink-0"
          />
        </NuxtLink>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="profileData.totalOpen === 0 && !profileData.projects?.length"
      class="px-5 pb-4"
    >
      <div class="flex items-center gap-2 text-sm text-dimmed">
        <UIcon
          name="i-lucide-inbox"
          class="text-base"
        />
        <span>No project memberships yet</span>
      </div>
    </div>
  </div>
</template>
