<script setup lang="ts">
/**
 * A milestone's name, target date and description. Follows the app's commit
 * contracts (CLAUDE.md): creating commits once and Cancel discards; editing an
 * existing milestone commits each field as it is left, so there is no Save.
 * Deleting is the panel's menu, behind a confirmation.
 */
export interface MilestoneFields { id: string, name: string, description: string | null, targetDate: string | null }

const props = defineProps<{
  projectId: string
  /** The milestone to edit; absent to create one. */
  milestone?: MilestoneFields | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const name = ref('')
const targetDate = ref('')
const description = ref('')
const busy = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.milestone?.name ?? ''
  targetDate.value = props.milestone?.targetDate ?? ''
  description.value = props.milestone?.description ?? ''
  error.value = ''
}, { immediate: true })

async function send(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    emit('saved')
    return true
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to save milestone')
    return false
  } finally {
    busy.value = false
  }
}

async function create() {
  if (!name.value.trim()) return
  const ok = await send(() => $fetch(`/api/projects/${props.projectId}/milestones`, {
    method: 'POST',
    body: { name: name.value.trim(), targetDate: targetDate.value || null, description: description.value.trim() || undefined }
  }))
  if (ok) open.value = false
}

/** Edit mode: one field, committed as it is left. */
function commit(field: 'name' | 'targetDate' | 'description') {
  const m = props.milestone
  if (!m) return
  const value = field === 'name' ? name.value.trim() : field === 'targetDate' ? (targetDate.value || null) : (description.value.trim() || null)
  if (field === 'name' && !value) {
    name.value = m.name
    return
  }
  if (value === (m[field] ?? null)) return
  send(() => $fetch(`/api/milestones/${m.id}`, { method: 'PUT', body: { [field]: value } }))
}
</script>

<template>
  <UiModal
    v-model:open="open"
    icon="i-lucide-diamond"
    :title="milestone ? 'Edit milestone' : 'New milestone'"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Name">
          <UInput
            v-model="name"
            placeholder="e.g. S1 Praxis bereit"
            class="w-full"
            autofocus
            @blur="commit('name')"
            @keydown.enter.prevent="milestone ? commit('name') : create()"
          />
        </UFormField>
        <UFormField label="Target date">
          <UInput
            v-model="targetDate"
            type="date"
            class="w-full"
            @change="commit('targetDate')"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="description"
            :rows="4"
            autoresize
            class="w-full"
            @blur="commit('description')"
          />
        </UFormField>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="error"
        />
      </div>
    </template>
    <template
      v-if="!milestone"
      #footer
    >
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Create milestone"
          :loading="busy"
          :disabled="!name.trim()"
          @click="create"
        />
      </div>
    </template>
  </UiModal>
</template>
