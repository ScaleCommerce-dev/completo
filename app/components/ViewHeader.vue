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
import type { FieldMenuOption } from '~/types/field-menu'

interface View {
  id: string
  name: string
  slug: string
}

const props = defineProps<{
  projectName: string
  projectSlug: string
  viewName: string
  /** Which kind of view this page is — picks the breadcrumb glyph. */
  viewKind: 'board' | 'list'
  /** Slug *or* id, whichever the route carried, so the current view can be marked. */
  viewSlug: string
  boards?: View[]
  lists?: View[]
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

const KIND_ICON = { board: 'i-lucide-layout-dashboard', list: 'i-lucide-list' } as const

/**
 * Switching view is the same act as picking a status — one from a list, the
 * current one marked — so it is the same menu. See `FieldMenu`.
 *
 * It was a bare `UDropdownMenu` fed by a builder duplicated across the board and
 * the list page, and the two copies marked the current view by *swapping its
 * icon for a check* and disabling the row. That cost twice: the view you are
 * looking at was the one row that didn't say whether it was a board or a list,
 * and it rendered greyed out, which reads as "unavailable" rather than "you are
 * here". `FieldMenu` puts the check in the trailing slot, so the type glyph
 * stays where it is on every row.
 *
 * One flat list rather than a group per kind: the glyph already says which is
 * which, and a project's views are few enough that two headers would be more
 * furniture than the list itself.
 */
const isCurrent = (view: View) => view.slug === props.viewSlug || view.id === props.viewSlug

const viewOptions = computed<FieldMenuOption[]>(() => [
  ...(props.boards || []).map(board => ({
    label: board.name,
    checked: props.viewKind === 'board' && isCurrent(board),
    icon: KIND_ICON.board,
    onSelect: () => navigateTo(`/projects/${props.projectSlug}/boards/${board.slug || board.id}`)
  })),
  ...(props.lists || []).map(list => ({
    label: list.name,
    checked: props.viewKind === 'list' && isCurrent(list),
    icon: KIND_ICON.list,
    onSelect: () => navigateTo(`/projects/${props.projectSlug}/lists/${list.slug || list.id}`)
  }))
])
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
        <FieldMenu
          label="Views"
          :options="viewOptions"
        >
          <UTooltip text="Switch view">
            <button
              type="button"
              class="group/name flex items-center gap-1.5 font-bold tracking-name text-highlighted cursor-pointer hover:text-primary transition-colors min-w-0"
              :aria-label="`Switch view — currently ${viewName}`"
            >
              <UIcon
                :name="KIND_ICON[viewKind]"
                class="size-4 shrink-0 text-dimmed"
              />
              <span class="truncate max-w-60">{{ viewName }}</span>
              <!--
                Steady, not `opacity-40` fading in on hover. This is the only
                thing marking the view name as a control, and a project's header
                carries exactly one of them — the quiet-until-hovered treatment
                belongs to the list cells, where there are dozens per screen.
              -->
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3 shrink-0 text-dimmed group-hover/name:text-primary transition-colors"
              />
            </button>
          </UTooltip>
        </FieldMenu>
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
      <!-- Shared with `my-tasks.vue`, which configures the same dialog — see
           `UiSettingsButton` for why the button is the shared piece and this
           component is not. -->
      <UiSettingsButton
        v-if="canConfigure"
        @click="$emit('open-settings')"
      />
    </template>

    <slot />
  </UiPage>
</template>
