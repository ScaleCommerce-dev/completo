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
  updateCardTags,
  findCard
} = useMyTasks()

const showColumnConfig = ref(false)

/**
 * A card opens in the panel here, exactly as it does on a board and a list.
 *
 * It used to `navigateTo` the card's full page, which made My Tasks the one
 * surface where clicking a card left the surface — a card is a panel, and the
 * rule is per object, not per host (see CLAUDE.md). Nothing was standing in the
 * way: `CardModal` already names My Tasks as a host it renders without a board
 * to reveal a column in, and `/api/my-tasks` already returns the statuses, tags
 * and members the panel needs, per project, because the table's own cells need
 * the same ones.
 *
 * There is no `nav` prop, so the ←/→ walker stays hidden — the walker's "2/7"
 * and its column crossings are board geometry. Cards here are grouped by
 * project, which is a set worth stepping through, but not this one.
 */
const selectedCardId = ref<number | null>(null)
const showCardDetail = ref(false)

/**
 * Resolved on every render rather than captured on click, so the open panel sees
 * the in-place patches `updateCard` makes. `findCard` hands back the owning group
 * too, and that is the part My Tasks needs that a project view does not: statuses,
 * members and tags are only meaningful within the group the card sits in.
 */
const selected = computed(() =>
  selectedCardId.value === null ? null : findCard(selectedCardId.value)
)

/** Owners may delete others' comments. Never an admin's synthetic role — see my-tasks.get.ts. */
const canModerateComments = computed(() => selected.value?.group.role === 'owner')

function handleCardClick(card: { id: number }) {
  selectedCardId.value = card.id
  showCardDetail.value = true
}

/**
 * ↑/↓ walk every card on the page, across project boundaries — one sequence, not
 * one per project.
 *
 * That is the whole reason this works without extra plumbing: `selected` resolves
 * the id through `findCard`, so stepping onto a card in another project swaps the
 * statuses, members, tags and project key the panel is handed, because they come
 * from whichever group holds the card. The walker sets an id; the group follows.
 *
 * Order per group is `ListView`'s, keyed by project — each group is its own table
 * with its own sortable headers, so there is no single sort to ask for. Collapsed
 * groups are skipped: their table is unmounted, so a stale entry would otherwise
 * walk into cards that are not on screen. Every card the page shows, in the order
 * it shows them, and nothing else.
 */
const rowOrder = ref(new Map<string, number[]>())

const walkSequence = computed(() => groupedSequence(
  groups.value.map(g => g.project.id),
  rowOrder.value,
  id => collapsedProjectIds.value.has(id)
))

const { nav: cardNav, step: cardWalk } = useCardWalk({
  open: () => showCardDetail.value,
  sequence: () => walkSequence.value,
  currentId: () => selectedCardId.value,
  select: (cardId) => { selectedCardId.value = cardId }
})

function setRowOrder(projectId: string, cardIds: number[]) {
  // A new Map, not a mutation: `rowOrder` holds one, and Vue does not track
  // `Map.set` on a plain `ref` — the sequence would go stale exactly when a sort
  // changed it.
  rowOrder.value = new Map(rowOrder.value).set(projectId, cardIds)
}

/**
 * Reassigning the open card to somebody else closes the panel.
 *
 * This view *is* "cards assigned to me", so `updateCard` drops the row from the
 * data the moment its assignee stops being you (`useMyTasks.dropCard`). The panel
 * would then be left with no `card` prop — and `CardModal` treats an absent card
 * as *create* mode, so it would not empty, it would turn into a create form still
 * holding the old card's title. Closing is both correct and the only coherent
 * option: the card is no longer yours, and the toast already said what happened.
 */
watch(selected, (found) => {
  if (!found) {
    showCardDetail.value = false
    selectedCardId.value = null
  }
})

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
      <UiSettingsButton @click="showColumnConfig = true" />
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
          <span class="text-base font-bold tracking-name text-default">
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
            @card-click="handleCardClick"
            @update="handleInlineUpdate"
            @update-tags="handleInlineTagUpdate"
            @order="(ids) => setRowOrder(group.project.id, ids)"
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
         useMyTasks' add/remove/reorder were wired to it. ViewConfigModal drops a
         section whose props are absent, so omitting `viewName` drops rename and
         delete and omitting the `active*Filters` drops the Filters tab, leaving
         exactly the field picker this needs.

         Both omissions are load-bearing, not incidental: My Tasks spans every
         project, so there is no single view to rename and nowhere to persist a
         filter. The Filters tab used to render here regardless — its priority
         chips need no props — and Save emitted `update-filters` into a page that
         does not listen. -->
    <ViewConfigModal
      v-model:open="showColumnConfig"
      mode="list"
      :columns="columns"
      @add="addColumn"
      @delete="removeColumn"
      @reorder="reorderColumns"
    />

    <!-- The card panel, with the lookups of the group the card belongs to rather
         than a single project's — this is the one host where those differ per
         card. `v-if` on the group, not on the card: a null group would hand the
         panel empty status and member lists and turn its pickers into dead
         controls. -->
    <CardModal
      v-if="selected"
      v-model:open="showCardDetail"
      :card="selected.card"
      :statuses="selected.group.statuses"
      :members="selected.group.members"
      :tags="selected.group.tags"
      :project-key="selected.group.project.key"
      :project-slug="selected.group.project.slug"
      :can-moderate="canModerateComments"
      :nav="cardNav"
      @update="handleInlineUpdate"
      @update-tags="handleInlineTagUpdate"
      @navigate="cardWalk"
    />
  </UiPage>
</template>
