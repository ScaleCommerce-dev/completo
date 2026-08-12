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
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-default bg-default/60 backdrop-blur-sm">
      <div class="flex items-center gap-2.5">
        <h1 class="text-base font-extrabold tracking-[-0.02em] text-highlighted">
          My Tasks
        </h1>
        <span class="text-xs text-dimmed">Cards assigned to you across all projects</span>
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
            class="text-sm text-dimmed transition-transform duration-150"
            :class="{ 'rotate-90': !collapsedProjectIds.has(group.project.id) }"
          />
          <div class="flex items-center justify-center w-5 h-5 rounded-md bg-elevated">
            <UIcon
              :name="`i-lucide-${group.project.icon || 'folder'}`"
              class="text-2xs text-dimmed"
            />
          </div>
          <span class="text-base font-bold tracking-[-0.01em] text-default">
            {{ group.project.name }}
          </span>
          <span class="text-xs font-mono text-dimmed tabular-nums">
            {{ group.cards.length }}
          </span>
        </button>

        <!-- ListView table -->
        <div
          v-if="!collapsedProjectIds.has(group.project.id)"
          class="rounded-xl border border-default overflow-hidden"
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

      <UEmpty
        v-if="!groups.length"
        class="py-16"
        icon="i-lucide-circle-check"
        title="Nothing assigned to you"
        description="Cards assigned to you across every project show up here."
        :actions="[{ label: 'Browse projects', icon: 'i-lucide-layout-grid', variant: 'subtle', to: '/projects' }]"
      />
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
