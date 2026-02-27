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
  await $fetch(`/api/projects/${props.projectId}`, {
    method: 'PUT' as any,
    body: { doneStatusId: statusId }
  })
  emit('refresh')
}
</script>

<template>
  <div class="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
    <template v-for="col in statuses" :key="col.id">
      <!-- Editing inline -->
      <div
        v-if="editingColId === col.id"
        class="flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-zinc-700/50 border border-indigo-300 dark:border-indigo-500/50 shrink-0"
      >
        <span
          class="block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <input
          v-model="editingColName"
          type="text"
          class="w-24 text-[12px] font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-0 outline-none! ring-0! py-0"
          @keydown.enter="saveEditStatus"
          @keydown.escape="cancelEditStatus"
        />
        <UButton icon="i-lucide-check" variant="ghost" color="neutral" size="xs" @click="saveEditStatus" />
        <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="cancelEditStatus" />
      </div>

      <!-- Status chip — display state -->
      <UPopover v-else-if="isOwnerOrAdmin" v-model:open="colColorPopoverOpen[col.id]">
        <button
          type="button"
          class="group/chip flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 transition-colors"
          :class="col.id === doneStatusId
            ? 'bg-emerald-50 dark:bg-emerald-950/25 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40'
            : 'hover:bg-white dark:hover:bg-zinc-700/50'"
          @dblclick="startEditStatus(col)"
        >
          <UIcon
            v-if="col.id === doneStatusId"
            name="i-lucide-circle-check-big"
            class="text-[12px] text-emerald-500 dark:text-emerald-400"
          />
          <span
            v-else
            class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
            :style="{ backgroundColor: col.color || '#a1a1aa' }"
          />
          <span class="text-[12px] font-medium"
            :class="col.id === doneStatusId
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-zinc-600 dark:text-zinc-400'"
          >{{ col.name }}</span>
          <span class="text-[11px] font-semibold tabular-nums"
            :class="col.id === doneStatusId
              ? 'text-emerald-500/70 dark:text-emerald-400/70'
              : 'text-zinc-400 dark:text-zinc-500'"
          >{{ col.cardCount ?? 0 }}</span>
        </button>
        <template #content>
          <div class="p-2.5 w-44">
            <p class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Color</p>
            <ColorPicker :model-value="col.color || '#a1a1aa'" class="mb-3" @update:model-value="updateStatusColor(col.id, $event)" />
            <div class="flex flex-col gap-0.5 border-t border-zinc-100 dark:border-zinc-700/40 pt-2">
              <button
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                @click="colColorPopoverOpen[col.id] = false; startEditStatus(col)"
              >
                <UIcon name="i-lucide-pencil" class="text-[12px]" />
                Rename
              </button>
              <button
                v-if="col.id !== doneStatusId"
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] font-medium text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                @click="setDoneStatus(col.id); colColorPopoverOpen[col.id] = false"
              >
                <UIcon name="i-lucide-circle-check-big" class="text-[12px]" />
                Set as Done
              </button>
              <template v-if="confirmDeleteColId === col.id">
                <div class="flex items-center gap-1 px-2 py-1.5">
                  <span class="text-[11px] font-medium text-red-500">Delete?</span>
                  <UButton icon="i-lucide-check" variant="ghost" color="error" size="xs" @click="deleteProjectStatus(col.id); colColorPopoverOpen[col.id] = false" />
                  <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="cancelDeleteStatus" />
                </div>
              </template>
              <button
                v-else-if="col.id !== doneStatusId"
                type="button"
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                @click="requestDeleteStatus(col.id)"
              >
                <UIcon name="i-lucide-trash-2" class="text-[12px]" />
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
          ? 'bg-emerald-50 dark:bg-emerald-950/25 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40'
          : ''"
      >
        <UIcon
          v-if="col.id === doneStatusId"
          name="i-lucide-circle-check-big"
          class="text-[12px] text-emerald-500 dark:text-emerald-400"
        />
        <span
          v-else
          class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <span class="text-[12px] font-medium"
          :class="col.id === doneStatusId
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-zinc-600 dark:text-zinc-400'"
        >{{ col.name }}</span>
        <span class="text-[11px] font-semibold tabular-nums"
          :class="col.id === doneStatusId
            ? 'text-emerald-500/70 dark:text-emerald-400/70'
            : 'text-zinc-400 dark:text-zinc-500'"
        >{{ col.cardCount ?? 0 }}</span>
      </div>
    </template>

    <!-- Add status (owner/admin) -->
    <UPopover v-if="isOwnerOrAdmin" v-model:open="showAddColPopover">
      <button
        type="button"
        class="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-zinc-700/50 transition-colors shrink-0"
      >
        <UIcon name="i-lucide-plus" class="text-[12px]" />
        <span>Status</span>
      </button>
      <template #content>
        <form class="p-3 w-52" @submit.prevent="addProjectStatus(); showAddColPopover = false">
          <p class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">New status</p>
          <div class="flex items-center gap-2 mb-2">
            <UPopover v-model:open="newColColorOpen">
              <button
                type="button"
                class="w-4 h-4 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
                :style="{ backgroundColor: newColColor }"
              />
              <template #content>
                <div class="p-2">
                  <ColorPicker v-model="newColColor" />
                </div>
              </template>
            </UPopover>
            <input
              v-model="newColName"
              type="text"
              placeholder="Status name..."
              class="flex-1 text-[13px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none! ring-0! focus:border-indigo-300 dark:focus:border-indigo-500 transition-colors"
              @keydown.enter.prevent="addProjectStatus(); showAddColPopover = false"
            />
          </div>
          <UButton type="submit" size="xs" color="primary" variant="solid" :disabled="!newColName.trim()" class="w-full justify-center">
            Add Status
          </UButton>
        </form>
      </template>
    </UPopover>

    <p v-if="statuses.length === 0 && !isOwnerOrAdmin" class="text-[12px] text-zinc-400 dark:text-zinc-500">No statuses configured.</p>
  </div>
</template>
