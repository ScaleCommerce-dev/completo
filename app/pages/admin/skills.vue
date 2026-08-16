<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'AI Skills · Completo' })

interface Skill {
  id: string
  name: string
  prompt: string
  scope: 'card' | 'board'
}

const { data: skills, refresh } = await useFetch<Skill[]>('/api/admin/skills')

// Create/Edit modal
const showModal = ref(false)
const editTarget = ref<Skill | null>(null)
const modalName = ref('')
const modalPrompt = ref('')
const modalScope = ref<'card' | 'board'>('card')
const modalError = ref('')
const modalSaving = ref(false)

const isEdit = computed(() => !!editTarget.value)

function openCreate() {
  editTarget.value = null
  modalName.value = ''
  modalPrompt.value = ''
  modalScope.value = 'card'
  modalError.value = ''
  showModal.value = true
}

function openEdit(skill: Skill) {
  editTarget.value = skill
  modalName.value = skill.name
  modalPrompt.value = skill.prompt
  modalScope.value = skill.scope
  modalError.value = ''
  showModal.value = true
}

async function saveSkill() {
  if (!modalName.value.trim() || !modalPrompt.value.trim()) {
    modalError.value = 'Name and prompt are required'
    return
  }
  modalSaving.value = true
  modalError.value = ''
  try {
    if (isEdit.value) {
      await $fetch(`/api/admin/skills/${editTarget.value!.id}`, {
        method: 'PUT',
        body: {
          name: modalName.value.trim(),
          prompt: modalPrompt.value.trim(),
          scope: modalScope.value
        }
      })
    } else {
      await $fetch('/api/admin/skills', {
        method: 'POST',
        body: {
          name: modalName.value.trim(),
          prompt: modalPrompt.value.trim(),
          scope: modalScope.value
        }
      })
    }
    showModal.value = false
    await refresh()
  } catch (e: unknown) {
    modalError.value = getErrorMessage(e, 'Failed to save skill')
  } finally {
    modalSaving.value = false
  }
}

// Delete
const showDeleteModal = ref(false)
const deleteTarget = ref<Skill | null>(null)
const deleting = ref(false)

function openDelete(skill: Skill) {
  deleteTarget.value = skill
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/skills/${deleteTarget.value.id}` as string, { method: 'DELETE' as const })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (e) {
    // try/finally with no catch left the rejection unhandled: the dialog stayed
    // open with the skill still listed and nothing said why.
    useToast().add({ title: 'Failed to delete skill', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    deleting.value = false
  }
}

const scopeColors: Record<string, { text: string, bg: string }> = {
  card: { text: 'text-primary', bg: 'bg-primary/10' },
  board: { text: 'text-success', bg: 'bg-success/10' }
}
</script>

<template>
  <UiPage
    title="AI Skills"
    description="Prompt templates the AI writer works from"
  >
    <template #actions>
      <UButton
        label="Add skill"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </template>

    <UEmpty
      v-if="!skills?.length"
      class="py-16"
      icon="i-lucide-sparkles"
      title="No AI skills yet"
      description="Skills give the AI writer a house style for card descriptions and comments."
      :actions="[{ label: 'Add a skill', icon: 'i-lucide-plus', variant: 'subtle', onClick: openCreate }]"
    />

    <!-- Skills grid -->
    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="group rounded-xl border border-default hover:border-primary/60 hover:shadow-float p-4 transition-colors"
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon
              name="i-lucide-wand-sparkles"
              class="text-base text-secondary shrink-0"
            />
            <h3 class="font-bold text-base tracking-name text-highlighted truncate">
              {{ skill.name }}
            </h3>
          </div>
          <div class="flex items-center gap-0.5 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-opacity shrink-0">
            <UTooltip text="Edit">
              <button
                class="p-1.5 rounded-md text-dimmed hover:text-primary hover:bg-primary/10 transition-colors"
                @click="openEdit(skill)"
              >
                <UIcon
                  name="i-lucide-pencil"
                  class="text-sm"
                />
              </button>
            </UTooltip>
            <UTooltip text="Delete">
              <button
                class="p-1.5 rounded-md text-dimmed hover:text-error hover:bg-error/10 transition-colors"
                @click="openDelete(skill)"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="text-sm"
                />
              </button>
            </UTooltip>
          </div>
        </div>

        <!-- Scope badge -->
        <span
          class="inline-block text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full mb-2"
          :class="[scopeColors[skill.scope]?.text, scopeColors[skill.scope]?.bg]"
        >
          {{ skill.scope }}
        </span>

        <!-- Prompt preview -->
        <p class="text-xs text-muted font-mono leading-relaxed line-clamp-3">
          {{ skill.prompt }}
        </p>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal
      v-model:open="showModal"
      :ui="{ content: 'sm:max-w-[520px]' }"
    >
      <template #content>
        <div class="rounded-xl bg-default overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <h2 class="text-base font-bold tracking-heading text-highlighted mb-4">
              {{ isEdit ? 'Edit Skill' : 'New Skill' }}
            </h2>

            <div class="flex flex-col gap-3.5">
              <!-- Name -->
              <div>
                <label class="block text-xs font-semibold uppercase tracking-label text-dimmed mb-1.5">
                  Name
                </label>
                <input
                  v-model="modalName"
                  type="text"
                  placeholder="e.g. Generate Description"
                  class="w-full px-3 py-2 text-base text-default placeholder:text-dimmed bg-default border border-accented rounded-lg outline-none focus:border-primary transition-colors"
                >
              </div>

              <!-- Scope -->
              <div>
                <label class="block text-xs font-semibold uppercase tracking-label text-dimmed mb-1.5">
                  Scope
                </label>
                <div class="flex gap-2">
                  <button
                    v-for="s in (['card', 'board'] as const)"
                    :key="s"
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                    :class="modalScope === s
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'text-dimmed hover:text-toned hover:bg-elevated'"
                    @click="modalScope = s"
                  >
                    {{ s.charAt(0).toUpperCase() + s.slice(1) }}
                  </button>
                </div>
              </div>

              <!-- Prompt -->
              <div>
                <label class="block text-xs font-semibold uppercase tracking-label text-dimmed mb-1.5">
                  Prompt Template
                </label>
                <textarea
                  v-model="modalPrompt"
                  rows="6"
                  placeholder="Write a prompt template..."
                  class="w-full px-3 py-2 text-sm font-mono text-default placeholder:text-dimmed bg-default border border-accented rounded-lg outline-none focus:border-primary transition-colors resize-y leading-relaxed"
                />
                <p class="text-xs text-dimmed mt-1">
                  Variables: <code class="px-1 py-0.5 rounded-md bg-elevated text-2xs">{title}</code>
                  <code class="px-1 py-0.5 rounded-md bg-elevated text-2xs">{description}</code>
                  <code class="px-1 py-0.5 rounded-md bg-elevated text-2xs">{tags}</code>
                  <code class="px-1 py-0.5 rounded-md bg-elevated text-2xs">{priority}</code>
                </p>
              </div>
            </div>
          </div>

          <!-- Error -->
          <UAlert
            v-if="modalError"
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            :description="modalError"
            class="mx-5 mb-3"
          />

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-muted mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
              @click="showModal = false"
            >
              Cancel
            </button>
            <UButton
              :label="isEdit ? 'Save' : 'Create'"
              :loading="modalSaving"
              :disabled="!modalName.trim() || !modalPrompt.trim()"
              @click="saveSkill"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="rounded-xl bg-default overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-error/10">
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="text-lg text-error"
                />
              </div>
              <div>
                <h2 class="text-base font-bold tracking-heading text-highlighted">
                  Delete Skill
                </h2>
                <p class="text-sm text-muted">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <p
              v-if="deleteTarget"
              class="text-sm text-muted leading-relaxed"
            >
              Are you sure you want to delete <strong class="text-default">"{{ deleteTarget.name }}"</strong>?
            </p>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-muted mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
              @click="showDeleteModal = false"
            >
              Cancel
            </button>
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Delete"
              :loading="deleting"
              :disabled="deleting"
              @click="confirmDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UiPage>
</template>
