<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'My Tasks · Completo' })

const {
  columns,
  collapsedProjectIds,
  groups,
  addColumn,
  removeColumn,
  reorderColumns,
  toggleCollapse,
  updateCard,
  updateCardTags
} = useMyTasks()

const showColumnConfig = ref(false)

function handleCardClick(card: { id: number }, projectSlug: string, projectKey: string) {
  navigateTo(`/projects/${projectSlug}/cards/${formatTicketId(projectKey, card.id)}`)
}

async function handleInlineUpdate(cardId: number, updates: Record<string, unknown>) {
  await updateCard(cardId, updates)
}

async function handleInlineTagUpdate(cardId: number, tagIds: string[]) {
  await updateCardTags(cardId, tagIds)
}
</script>

<template>
  <UiPage
    title="My Tasks"
    description="Assigned to you, across every project"
    variant="surface"
  >
    <template #actions>
      <UButton
        icon="i-lucide-columns-3"
        label="Fields"
        variant="ghost"
        color="neutral"
        @click="showColumnConfig = true"
      />
    </template>

    <div class="flex-1 overflow-auto p-4 flex flex-col gap-4 thin-scroll">
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
            :tags="group.tags"
            :members="group.members"
            @card-click="(card) => handleCardClick(card, group.project.slug, group.project.key)"
            @update="handleInlineUpdate"
            @update-tags="handleInlineTagUpdate"
          />
        </div>
      </div>

      <!-- The membership sentence is the point: My Tasks is deliberately not
           admin-elevated, so an instance admin who can see every project still lands on
           an empty page here, and the old copy ("across every project") said the
           opposite of what had happened. -->
      <UEmpty
        v-if="!groups.length"
        class="py-16"
        icon="i-lucide-circle-check"
        title="Nothing assigned to you"
        description="Cards assigned to you show up here — from projects you belong to. Join a project, or ask someone to assign you a card."
        :actions="[{ label: 'Browse projects', icon: 'i-lucide-layout-grid', variant: 'subtle', to: '/projects' }]"
      />
    </div>

    <!-- Column config modal -->
    <!-- This was `<ListColumnConfigModal>`, a component that does not exist
         anywhere in the repo — so the Fields button silently opened nothing and
         useMyTasks' add/remove/reorder were wired to it. ViewConfigModal already
         guards its rename and delete sections on `viewName`, so omitting that
         prop gives exactly the field picker this needs. -->
    <ViewConfigModal
      v-model:open="showColumnConfig"
      mode="list"
      :columns="columns"
      @add="addColumn"
      @delete="removeColumn"
      @reorder="reorderColumns"
    />
  </UiPage>
</template>
