<script setup lang="ts">
/**
 * A project's settings, as a dialog over whichever page opened it.
 *
 * It used to live inside All Projects only, and the project page's Settings
 * button linked to `/projects?edit=<id>`, which opened it there. So editing a
 * project's settings from the project took you out of it: the page changed under
 * the dialog, and closing it left you on All Projects. Saving navigated back;
 * Cancel and Esc did not. Now both pages mount this, and the dialog opens where
 * you are — the same component mounted twice, never a second design.
 *
 * It opens on what the caller already has and fills in the rest from the
 * project's detail: statuses for the done-status picker, the briefing and the
 * retention setting, none of which every caller carries.
 *
 * What happens after a save or delete belongs to the caller — a list refreshes,
 * the project page follows a changed slug or leaves a deleted project — so this
 * only emits.
 */
export interface ProjectSettingsTarget {
  id: string
  name: string
  key: string
  slug: string
  description: string | null
  icon: string | null
  doneStatusId: string | null
  briefing?: string | null
  doneRetentionDays?: number | null
}

const props = defineProps<{
  project: ProjectSettingsTarget | null
}>()

const emit = defineEmits<{
  saved: [project: { id: string, slug: string }]
  deleted: [projectId: string]
}>()

const open = defineModel<boolean>('open', { required: true })

type FormData = Required<ProjectSettingsTarget>
interface Status { id: string, name: string, color: string | null }

const formData = ref<FormData | undefined>(undefined)
const statuses = ref<Status[]>([])
const loadingStatuses = ref(false)
const error = ref('')
const saving = ref(false)
const deleting = ref(false)

watch(open, async (isOpen) => {
  const p = props.project
  if (!isOpen || !p) return
  error.value = ''
  saving.value = false
  deleting.value = false
  formData.value = {
    id: p.id,
    name: p.name,
    key: p.key || '',
    slug: p.slug || '',
    description: p.description || null,
    icon: p.icon || null,
    doneStatusId: p.doneStatusId || null,
    briefing: p.briefing ?? null,
    doneRetentionDays: p.doneRetentionDays ?? null
  }
  statuses.value = []
  loadingStatuses.value = true
  try {
    const detail = await $fetch<{ statuses?: Status[], doneStatusId?: string | null, doneRetentionDays?: number | null, briefing?: string | null }>(`/api/projects/${p.id}`)
    // Opened on another project, or closed, while this was in flight.
    if (!open.value || formData.value?.id !== p.id) return
    statuses.value = detail.statuses || []
    formData.value = {
      ...formData.value,
      doneStatusId: detail.doneStatusId || null,
      doneRetentionDays: detail.doneRetentionDays ?? null,
      briefing: detail.briefing || null
    }
  } catch {
    // The done-status picker stays empty; everything else still edits.
  } finally {
    loadingStatuses.value = false
  }
}, { immediate: true })

async function save(data: Record<string, unknown>) {
  const id = formData.value?.id
  if (!id) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/projects/${id}` as string, { method: 'PUT' as const, body: data })
    open.value = false
    emit('saved', { id, slug: (data.slug as string) || formData.value!.slug })
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to update project')
  } finally {
    saving.value = false
  }
}

async function remove() {
  const id = formData.value?.id
  if (!id) return
  deleting.value = true
  try {
    await $fetch(`/api/projects/${id}` as string, { method: 'DELETE' as const })
    open.value = false
    emit('deleted', id)
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to delete project')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <!-- `flush`, because `ProjectForm` carries its own padding and its own action
       row: it is also the whole of `projects/new`, so it cannot assume a dialog
       around it. One component, two placements. -->
  <UiModal
    v-model:open="open"
    icon="i-lucide-folder-pen"
    title="Edit project"
    flush
  >
    <template #body>
      <ProjectForm
        mode="edit"
        :initial-data="formData"
        :statuses="statuses"
        :loading-statuses="loadingStatuses"
        :loading="saving"
        :deleting="deleting"
        :error="error"
        @submit="save"
        @cancel="open = false"
        @delete="remove"
      />
    </template>
  </UiModal>
</template>
