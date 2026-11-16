<script setup lang="ts">
import type { ParentField } from '~/types/card'

/**
 * "Sub-task of TK-5 Launch the sub-task feature", under a sub-task's title in
 * the card panel and on the card's own page.
 *
 * The board card names the parent by ticket only (KanbanCard `relation`), which
 * suits a scanning surface and not a reading one: here the parent's title is
 * what tells you what this piece of work is part of, so it is spelled out, at
 * body size, as a link.
 *
 * A real anchor in both places, so ⌘-click and "copy link" work. In the panel a
 * plain click opens the parent in the panel instead (`inPanel`), because leaving
 * the board for a full page is not what clicking a card there does anywhere
 * else.
 *
 * It also owns changing the parent. The Parent property only offers attaching
 * one (CardProperties `parentField`): a second place showing the same ticket
 * and title one line below this would be the same fact twice.
 */
const props = defineProps<{
  field: ParentField & { parent: NonNullable<ParentField['parent']> }
  projectSlug?: string
  inPanel?: boolean
}>()

const emit = defineEmits<{
  'open': [cardId: number]
  'set-parent': [parentId: number | null]
}>()

const ticket = computed(() => formatTicketId(props.field.projectKey, props.field.parent.id))
const to = computed(() => props.projectSlug ? `/projects/${props.projectSlug}/cards/${ticket.value}` : undefined)

/**
 * On the wrapper in the capture phase, not on the link: NuxtLink's own click
 * handler runs before any listener added to it, and it navigates unless the
 * event is already `defaultPrevented` by then.
 */
function onClick(e: MouseEvent) {
  if (!props.inPanel || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  if (!(e.target as Element | null)?.closest('a')) return
  e.preventDefault()
  emit('open', props.field.parent.id)
}
</script>

<template>
  <div
    class="flex items-center gap-0.5 min-w-0 text-sm"
    @click.capture="onClick"
  >
    <NuxtLink
      :to="to"
      class="group/parent flex items-baseline gap-1.5 min-w-0 rounded-md px-1.5 py-0.5 -ml-1.5 hover:bg-elevated transition-colors"
      :aria-label="`Sub-task of ${ticket}: ${field.parent.title}. Open parent`"
    >
      <!-- `items-baseline` on the row, the icon centred on its own: the ticket
           is DM Mono at 12px between Jakarta Sans at 13px, and centring their
           boxes left the ticket a pixel off the words' baseline — the same fix
           as the panel header's ticket and byline (CardModal). -->
      <UIcon
        name="i-lucide-corner-left-up"
        class="text-sm text-dimmed shrink-0 self-center"
      />
      <span class="text-muted shrink-0">Sub-task of</span>
      <span class="card-id text-xs text-dimmed shrink-0">{{ ticket }}</span>
      <span class="truncate font-medium text-toned group-hover/parent:text-highlighted transition-colors">{{ field.parent.title }}</span>
    </NuxtLink>

    <ParentMenu
      :project-id="field.projectId"
      :card-id="field.cardId"
      :parent-id="field.parent.id"
      :project-key="field.projectKey"
      :content="FIELD_MENU_ALIGN_START"
      @select="id => emit('set-parent', id)"
    >
      <UTooltip text="Change parent">
        <UButton
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0 text-dimmed"
          aria-label="Change parent"
        />
      </UTooltip>
    </ParentMenu>
  </div>
</template>
