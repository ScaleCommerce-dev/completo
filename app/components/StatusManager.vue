<script setup lang="ts">
interface Status {
  id: string
  name: string
  color: string | null
  cardCount?: number
}

const props = defineProps<{
  statuses: Status[]
  doneStatusId: string | null
  projectId: string
  isOwnerOrAdmin: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const newColName = ref('')
const newColColor = ref('#6366f1')
const newColColorOpen = ref(false)
const showAddColPopover = ref(false)
const newColNameInput = ref<HTMLInputElement | null>(null)

watch(showAddColPopover, (open) => {
  if (open) {
    nextTick(() => newColNameInput.value?.focus())
  }
})
const editingColId = ref<string | null>(null)
const editingColName = ref('')
const confirmDeleteColId = ref<string | null>(null)
let confirmDeleteTimeout: ReturnType<typeof setTimeout> | null = null
const colColorPopoverOpen = ref<Record<string, boolean>>({})

async function updateStatusColor(colId: string, color: string) {
  colColorPopoverOpen.value[colId] = false
  await $fetch(`/api/statuses/${colId}`, {
    method: 'PUT',
    body: { color }
  })
  emit('refresh')
}

async function addProjectStatus() {
  if (!newColName.value.trim()) return
  await $fetch(`/api/projects/${props.projectId}/statuses`, {
    method: 'POST',
    body: { name: newColName.value.trim(), color: newColColor.value }
  })
  newColName.value = ''
  newColColor.value = '#6366f1'
  emit('refresh')
}

function startEditStatus(col: Status) {
  editingColId.value = col.id
  editingColName.value = col.name
}

async function saveEditStatus() {
  if (!editingColId.value || !editingColName.value.trim()) return
  await $fetch(`/api/statuses/${editingColId.value}`, {
    method: 'PUT',
    body: { name: editingColName.value.trim() }
  })
  editingColId.value = null
  editingColName.value = ''
  emit('refresh')
}

function cancelEditStatus() {
  editingColId.value = null
  editingColName.value = ''
}

function requestDeleteStatus(colId: string) {
  if (confirmDeleteTimeout) clearTimeout(confirmDeleteTimeout)
  confirmDeleteColId.value = colId
  confirmDeleteTimeout = setTimeout(() => {
    confirmDeleteColId.value = null
  }, 5000)
}

async function deleteProjectStatus(colId: string) {
  if (confirmDeleteTimeout) clearTimeout(confirmDeleteTimeout)
  confirmDeleteColId.value = null
  await $fetch(`/api/statuses/${colId}`, { method: 'DELETE' })
  emit('refresh')
}

function cancelDeleteStatus() {
  if (confirmDeleteTimeout) clearTimeout(confirmDeleteTimeout)
  confirmDeleteColId.value = null
}

async function setDoneStatus(statusId: string | null) {
  await $fetch(`/api/projects/${props.projectId}` as string, {
    method: 'PUT' as const,
    body: { doneStatusId: statusId }
  })
  emit('refresh')
}
</script>

<template>
  <div class="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
    <template
      v-for="col in statuses"
      :key="col.id"
    >
      <!-- Editing inline -->
      <div
        v-if="editingColId === col.id"
        class="flex items-center gap-1 px-2 py-1 rounded-md bg-white bg-accented border border-primary/60 border-primary/50 shrink-0"
      >
        <span
          class="block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <input
          v-model="editingColName"
          type="text"
          class="w-24 text-xs font-medium text-highlighted bg-transparent border-0 outline-none! ring-0! py-0"
          @keydown.enter="saveEditStatus"
          @keydown.escape="cancelEditStatus"
        >
        <UButton
          icon="i-lucide-check"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="saveEditStatus"
        />
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="cancelEditStatus"
        />
      </div>

      <!-- Status chip — display state -->
      <UPopover
        v-else-if="isOwnerOrAdmin"
        v-model:open="colColorPopoverOpen[col.id]"
      >
        <button
          type="button"
          class="group/chip flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 transition-colors"
          :class="col.id === doneStatusId
            ? 'bg-emerald-50 dark:bg-emerald-950/25 ring-1 ring-success/30 dark:ring-emerald-800/40'
            : 'hover:bg-white hover:bg-elevated'"
          @dblclick="startEditStatus(col)"
        >
          <UIcon
            v-if="col.id === doneStatusId"
            name="i-lucide-circle-check-big"
            class="text-xs text-success dark:text-emerald-400"
          />
          <span
            v-else
            class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
            :style="{ backgroundColor: col.color || '#a1a1aa' }"
          />
          <span
            class="text-xs font-medium"
            :class="col.id === doneStatusId
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-toned'"
          >{{ col.name }}</span>
          <span
            class="text-xs font-semibold tabular-nums"
            :class="col.id === doneStatusId
              ? 'text-emerald-500/70 dark:text-emerald-400/70'
              : 'text-dimmed'"
          >{{ col.cardCount ?? 0 }}</span>
        </button>
        <template #content>
          <div class="p-2.5 w-44">
            <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Color
            </p>
            <ColorPicker
              :model-value="col.color || '#a1a1aa'"
              class="mb-3"
              @update:model-value="updateStatusColor(col.id, $event)"
            />
            <div class="flex flex-col gap-0.5 border-t border-muted pt-2">
              <button
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-muted hover:text-default hover:bg-elevated transition-colors"
                @click="colColorPopoverOpen[col.id] = false; startEditStatus(col)"
              >
                <UIcon
                  name="i-lucide-pencil"
                  class="text-xs"
                />
                Rename
              </button>
              <button
                v-if="col.id !== doneStatusId"
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-muted hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                @click="setDoneStatus(col.id); colColorPopoverOpen[col.id] = false"
              >
                <UIcon
                  name="i-lucide-circle-check-big"
                  class="text-xs"
                />
                Set as Done
              </button>
              <template v-if="confirmDeleteColId === col.id">
                <div class="flex items-center gap-1 px-2 py-1.5">
                  <span class="text-xs font-medium text-error">Delete?</span>
                  <UButton
                    icon="i-lucide-check"
                    variant="ghost"
                    color="error"
                    size="xs"
                    @click="deleteProjectStatus(col.id); colColorPopoverOpen[col.id] = false"
                  />
                  <UButton
                    icon="i-lucide-x"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="cancelDeleteStatus"
                  />
                </div>
              </template>
              <button
                v-else-if="col.id !== doneStatusId"
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-error hover:bg-error/10 transition-colors"
                @click="requestDeleteStatus(col.id)"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="text-xs"
                />
                Delete
              </button>
            </div>
          </div>
        </template>
      </UPopover>

      <!-- Status chip — read-only (members) -->
      <div
        v-else
        class="flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 transition-colors"
        :class="col.id === doneStatusId
          ? 'bg-emerald-50 dark:bg-emerald-950/25 ring-1 ring-success/30 dark:ring-emerald-800/40'
          : ''"
      >
        <UIcon
          v-if="col.id === doneStatusId"
          name="i-lucide-circle-check-big"
          class="text-xs text-success dark:text-emerald-400"
        />
        <span
          v-else
          class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <span
          class="text-xs font-medium"
          :class="col.id === doneStatusId
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-toned'"
        >{{ col.name }}</span>
        <span
          class="text-xs font-semibold tabular-nums"
          :class="col.id === doneStatusId
            ? 'text-emerald-500/70 dark:text-emerald-400/70'
            : 'text-dimmed'"
        >{{ col.cardCount ?? 0 }}</span>
      </div>
    </template>

    <!-- Add status (owner/admin) -->
    <UPopover
      v-if="isOwnerOrAdmin"
      v-model:open="showAddColPopover"
    >
      <button
        type="button"
        class="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-dimmed hover:text-primary hover:bg-white hover:bg-elevated transition-colors shrink-0"
      >
        <UIcon
          name="i-lucide-plus"
          class="text-xs"
        />
        <span>Status</span>
      </button>
      <template #content>
        <form
          class="p-3 w-52"
          @submit.prevent="addProjectStatus(); showAddColPopover = false"
        >
          <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            New status
          </p>
          <div class="flex items-center gap-2 mb-2">
            <UPopover v-model:open="newColColorOpen">
              <button
                type="button"
                class="w-4 h-4 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-primary transition cursor-pointer"
                :style="{ backgroundColor: newColColor }"
              />
              <template #content>
                <div class="p-2">
                  <ColorPicker v-model="newColColor" />
                </div>
              </template>
            </UPopover>
            <input
              ref="newColNameInput"
              v-model="newColName"
              type="text"
              placeholder="Status name..."
              class="flex-1 text-sm font-medium text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border border-accented rounded-md px-2 py-1 outline-none! ring-0! focus:border-primary transition-colors"
              @keydown.enter.prevent="addProjectStatus(); showAddColPopover = false"
            >
          </div>
          <UButton
            type="submit"
            size="xs"
            color="primary"
            variant="solid"
            :disabled="!newColName.trim()"
            class="w-full justify-center"
          >
            Add Status
          </UButton>
        </form>
      </template>
    </UPopover>

    <p
      v-if="statuses.length === 0 && !isOwnerOrAdmin"
      class="text-xs text-dimmed"
    >
      No statuses configured.
    </p>
  </div>
</template>
