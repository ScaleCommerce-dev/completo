<script setup lang="ts">
import type { FieldMenuOption } from '~/types/field-menu'

/**
 * Picks the card this one is a sub-task of, or none.
 *
 * Offers only what the server accepts (`server/utils/subtasks.ts`): cards of the
 * same project that are not sub-tasks themselves, and never the card itself. A
 * project can hold thousands of cards, so the list is searched on the server
 * (`?parentId=none&q=`) rather than loaded whole, newest activity first.
 */
const props = defineProps<{
  projectId: string
  cardId: number
  parentId: number | null
  projectKey?: string
  content?: Record<string, unknown>
}>()

const emit = defineEmits<{ select: [parentId: number | null] }>()

const open = ref(false)
const searchTerm = ref('')

interface Candidate { id: number, title: string }
const candidates = ref<Candidate[]>([])

/** Debounced, so typing a word is one request rather than one per letter. */
let timer: ReturnType<typeof setTimeout> | null = null
function load() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    try {
      const rows = await $fetch<Candidate[]>(`/api/projects/${props.projectId}/cards`, {
        query: { parentId: 'none', q: searchTerm.value.trim() || undefined, sort: 'updatedAt', order: 'desc', limit: 20, includeDone: 'true' }
      })
      candidates.value = rows.filter(c => c.id !== props.cardId)
    } catch {
      candidates.value = []
    }
  }, 200)
}
onScopeDispose(() => {
  if (timer) clearTimeout(timer)
})

watch(open, (isOpen) => {
  if (isOpen) load()
})
watch(searchTerm, () => {
  if (open.value) load()
})

const ticket = (id: number) => formatTicketId(props.projectKey, id)

const options = computed<FieldMenuOption[]>(() => [
  {
    label: 'No parent',
    checked: props.parentId === null,
    icon: 'i-lucide-circle-off',
    iconClass: 'text-dimmed',
    onSelect: () => emit('select', null)
  },
  ...candidates.value.map(c => ({
    label: `${ticket(c.id)} ${c.title}`,
    checked: props.parentId === c.id,
    icon: 'i-lucide-corner-left-up',
    iconClass: 'text-dimmed',
    onSelect: () => emit('select', c.id)
  }))
])
</script>

<template>
  <FieldMenu
    v-model:open="open"
    v-model:search-term="searchTerm"
    label="Parent"
    :options="options"
    :content="content"
    searchable
    own-filter
  >
    <slot />
  </FieldMenu>
</template>
