<script setup lang="ts">
definePageMeta({ layout: 'default' })

const {
  columns,
  collapsedProjectIds,
  groups,
  addColumn,
  removeColumn,
  reorderColumns,
  toggleCollapse,
  updateCard
} = useMyTasks()

const showColumnConfig = ref(false)

function handleCardClick(card: { id: number }, projectSlug: string, projectKey: string) {
  navigateTo(`/projects/${projectSlug}/cards/${formatTicketId(projectKey, card.id)}`)
}

async function handleInlineUpdate(cardId: number, updates: Record<string, unknown>) {
  await updateCard(cardId, updates)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header bar -->
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-zinc-200/80 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
      <div class="flex items-center gap-2.5">
        <h1 class="text-[15px] font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
          My Tasks
        </h1>
        <span class="text-[12px] text-zinc-400 dark:text-zinc-500">Cards assigned to you across all projects</span>
      </div>
      <div class="flex items-center gap-1.5">
        <NotificationBell />
        <UButton
          icon="i-lucide-columns-3"
          label="Fields"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="showColumnConfig = true"
        />
      </div>
    </div>

    <!-- Project groups -->
    <div class="flex-1 overflow-auto p-4 flex flex-col gap-4">
      <div
        v-for="group in groups"
        :key="group.project.id"
      >
        <!-- Collapsible project header -->
        <button
          class="flex items-center gap-2 mb-2 w-full text-left group/proj"
          @click="toggleCollapse(group.project.id)"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="text-[13px] text-zinc-400 transition-transform duration-150"
            :class="{ 'rotate-90': !collapsedProjectIds.has(group.project.id) }"
          />
          <div class="flex items-center justify-center w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800">
            <UIcon
              :name="`i-lucide-${group.project.icon || 'folder'}`"
              class="text-[10px] text-zinc-400"
            />
          </div>
          <span class="text-[14px] font-bold tracking-[-0.01em] text-zinc-700 dark:text-zinc-300">
            {{ group.project.name }}
          </span>
          <span class="text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
            {{ group.cards.length }}
          </span>
        </button>

        <!-- ListView table -->
        <div
          v-if="!collapsedProjectIds.has(group.project.id)"
          class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 overflow-hidden"
        >
          <ListView
            :columns="columns"
            :cards="group.cards"
            :statuses="group.statuses"
            :project-key="group.project.key"
            :project-slug="group.project.slug"
            :done-status-id="group.project.doneStatusId"
            :read-only-fields="['status', 'assignee']"
            @card-click="(card) => handleCardClick(card, group.project.slug, group.project.key)"
            @update="handleInlineUpdate"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="!groups.length"
        class="text-center py-20"
      >
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 mb-4">
          <UIcon
            name="i-lucide-check-circle"
            class="text-3xl text-emerald-500"
          />
        </div>
        <p class="font-bold text-zinc-900 dark:text-zinc-100">
          All clear!
        </p>
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          No tasks assigned to you.
        </p>
      </div>
    </div>

    <!-- Column config modal -->
    <ListColumnConfigModal
      v-model:open="showColumnConfig"
      :columns="columns"
      @add="addColumn"
      @remove="removeColumn"
      @reorder="reorderColumns"
    />
  </div>
</template>
