<script setup lang="ts">
import type { Member } from '~/types/card'
import type { FieldMenuOption, FieldMenuSection } from '~/types/field-menu'

/**
 * Assignee picker. See `FieldMenu.vue`.
 *
 * A project with agents gets three groups (People, Your agents, Other agents)
 * from `groupForPicker`, so this menu, the @mention picker and the view filter
 * all answer "who is this list" the same way. People always come first and are
 * never capped, so they cannot get buried under a team's agents; other people's
 * agents show their three most recently active until a search asks for the rest.
 * A suspended agent is left out unless it is the current assignee, because
 * nothing it is handed can be done. A project without agents keeps the one plain
 * list it always had.
 */
const props = defineProps<{
  members?: Member[]
  assigneeId?: string | null
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const emit = defineEmits<{ select: [assigneeId: string | null] }>()

const { user } = useUserSession()
const search = ref('')

/** See `app/utils/field-labels.ts` — one definition per field, exposed through the slot. */
const ariaLabel = computed(() => assigneeFieldLabel(props.members, props.assigneeId))

const groups = computed(() => groupForPicker(props.members || [], {
  currentUserId: user.value?.id,
  query: search.value,
  keepIds: props.assigneeId ? [props.assigneeId] : []
}))

const toOption = (m: Member): FieldMenuOption => ({
  label: m.name,
  checked: props.assigneeId === m.id,
  avatar: { src: m.avatarUrl || undefined, alt: m.name, kind: m.kind, color: m.color },
  onSelect: () => emit('select', m.id)
})

const nobody = computed<FieldMenuOption>(() => ({
  label: 'Nobody',
  checked: !props.assigneeId,
  icon: 'i-lucide-user-x',
  iconClass: 'text-dimmed',
  onSelect: () => emit('select', null)
}))

const sections = computed<FieldMenuSection[]>(() => {
  const g = groups.value
  const lead = search.value.trim() ? [] : [nobody.value]
  if (!g.hasAgents) return [{ options: [...lead, ...g.people.map(toOption)] }]

  return [
    { options: lead },
    { label: 'People', options: g.people.map(toOption) },
    { label: 'Your agents', options: g.mine.map(toOption) },
    {
      label: 'Other agents',
      count: g.othersHidden ? g.othersTotal : undefined,
      options: g.others.map(toOption),
      note: g.othersHidden ? `${g.othersHidden} more, type to search` : undefined
    }
  ]
})

/** Searchable once the list is long, or once a group is holding names back. */
const searchable = computed(() => {
  const g = groupForPicker(props.members || [], { currentUserId: user.value?.id })
  return g.othersHidden > 0 || g.people.length + g.mine.length + g.others.length > 10
})
</script>

<template>
  <FieldMenu
    v-model:open="open"
    v-model:search-term="search"
    label="Assignee"
    :sections="sections"
    :searchable="searchable"
    own-filter
    :content="content"
  >
    <slot :label="ariaLabel" />
  </FieldMenu>
</template>
