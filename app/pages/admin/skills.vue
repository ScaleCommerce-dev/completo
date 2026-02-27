<script setup lang="ts">
definePageMeta({ layout: 'default' })

const { data: skills, refresh } = await useFetch<any[]>('/api/admin/skills')

// Create/Edit modal
const showModal = ref(false)
const editTarget = ref<any>(null)
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

function openEdit(skill: any) {
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
      await $fetch(`/api/admin/skills/${editTarget.value.id}`, {
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
  } catch (e: any) {
    modalError.value = e?.data?.message || 'Failed to save skill'
  } finally {
    modalSaving.value = false
  }
}

// Delete
const showDeleteModal = ref(false)
const deleteTarget = ref<any>(null)
const deleting = ref(false)

function openDelete(skill: any) {
  deleteTarget.value = skill
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/skills/${deleteTarget.value.id}`, { method: 'DELETE' as any })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}

const scopeColors: Record<string, { text: string, bg: string }> = {
  card: { text: 'text-indigo-500 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  board: { text: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' }
}
</script>

<template>
  <div class="p-6 max-w-5xl h-full overflow-y-auto">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-xl font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">AI Skills</h1>
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">Configurable prompt templates for AI writing</p>
      </div>
      <div class="flex items-center gap-3">
        <NotificationBell />
        <button
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all"
          @click="openCreate"
        >
          <UIcon name="i-lucide-plus" class="text-[14px]" />
          Add Skill
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!(skills as any[])?.length" class="text-center py-16">
      <UIcon name="i-lucide-sparkles" class="text-[32px] text-zinc-300 dark:text-zinc-600 mb-3" />
      <p class="text-[14px] text-zinc-500 dark:text-zinc-400">No AI skills configured yet</p>
      <button
        class="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-indigo-500 hover:text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-all"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="text-[13px]" />
        Create your first skill
      </button>
    </div>

    <!-- Skills grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="skill in (skills as any[])"
        :key="skill.id"
        class="group rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 p-4 transition-all"
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon name="i-lucide-wand-sparkles" class="text-[14px] text-violet-500 shrink-0" />
            <h3 class="font-bold text-[14.5px] tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 truncate">
              {{ skill.name }}
            </h3>
          </div>
          <div class="flex items-center gap-0.5 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-opacity shrink-0">
            <UTooltip text="Edit">
              <button
                class="p-1.5 rounded-md text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
                @click="openEdit(skill)"
              >
                <UIcon name="i-lucide-pencil" class="text-sm" />
              </button>
            </UTooltip>
            <UTooltip text="Delete">
              <button
                class="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                @click="openDelete(skill)"
              >
                <UIcon name="i-lucide-trash-2" class="text-sm" />
              </button>
            </UTooltip>
          </div>
        </div>

        <!-- Scope badge -->
        <span
          class="inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full mb-2"
          :class="[scopeColors[skill.scope]?.text, scopeColors[skill.scope]?.bg]"
        >
          {{ skill.scope }}
        </span>

        <!-- Prompt preview -->
        <p class="text-[12px] text-zinc-500 dark:text-zinc-400 font-mono leading-relaxed line-clamp-3">
          {{ skill.prompt }}
        </p>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="showModal" :ui="{ content: 'sm:max-w-[520px]' }">
      <template #content>
        <div class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <h2 class="text-[15px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100 mb-4">
              {{ isEdit ? 'Edit Skill' : 'New Skill' }}
            </h2>

            <div class="flex flex-col gap-3.5">
              <!-- Name -->
              <div>
                <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Name
                </label>
                <input
                  v-model="modalName"
                  type="text"
                  placeholder="e.g. Generate Description"
                  class="w-full px-3 py-2 text-[14px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
                />
              </div>

              <!-- Scope -->
              <div>
                <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Scope
                </label>
                <div class="flex gap-2">
                  <button
                    v-for="s in (['card', 'board'] as const)"
                    :key="s"
                    type="button"
                    class="px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
                    :class="modalScope === s
                      ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800/50'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
                    @click="modalScope = s"
                  >
                    {{ s.charAt(0).toUpperCase() + s.slice(1) }}
                  </button>
                </div>
              </div>

              <!-- Prompt -->
              <div>
                <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Prompt Template
                </label>
                <textarea
                  v-model="modalPrompt"
                  rows="6"
                  placeholder="Write a prompt template..."
                  class="w-full px-3 py-2 text-[13px] font-mono text-zinc-700 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors resize-y leading-relaxed"
                />
                <p class="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Variables: <code class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/50 text-[10px]">{title}</code>
                  <code class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/50 text-[10px]">{description}</code>
                  <code class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/50 text-[10px]">{tags}</code>
                  <code class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/50 text-[10px]">{priority}</code>
                </p>
              </div>
            </div>
          </div>

          <!-- Error -->
          <div v-if="modalError" class="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
            <UIcon name="i-lucide-alert-circle" class="text-[14px] text-red-500 shrink-0" />
            <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ modalError }}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40 mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="showModal = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!modalName.trim() || !modalPrompt.trim() || modalSaving"
              @click="saveSkill"
            >
              <UIcon v-if="modalSaving" name="i-lucide-loader-2" class="text-[14px] animate-spin" />
              {{ isEdit ? 'Save' : 'Create' }}
            </button>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30">
                <UIcon name="i-lucide-alert-triangle" class="text-lg text-red-500" />
              </div>
              <div>
                <h2 class="text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">Delete Skill</h2>
                <p class="text-[13px] text-zinc-500 dark:text-zinc-400">This action cannot be undone</p>
              </div>
            </div>
            <p v-if="deleteTarget" class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to delete <strong class="text-zinc-700 dark:text-zinc-200">"{{ deleteTarget.name }}"</strong>?
            </p>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40 mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="showDeleteModal = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-sm shadow-red-500/20 hover:shadow-md hover:shadow-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="deleting"
              @click="confirmDelete"
            >
              <UIcon v-if="!deleting" name="i-lucide-trash-2" class="text-[14px]" />
              <UIcon v-else name="i-lucide-loader-2" class="text-[14px] animate-spin" />
              Delete
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
