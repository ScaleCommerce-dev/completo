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
/**
 * One click, and that is very likely too weak for what this does: `cards.statusId`
 * cascades (schema.ts), so deleting a status deletes every card in it, and
 * `ui/ConfirmDialog` names statuses in its type-the-name tier for exactly that
 * reason. This surface is on a page, so it *can* raise a dialog — unlike the
 * comment and attachment rows. Left as it was rather than changed under cover of
 * an extraction; it is a decision to take on its own.
 */
const { armedId: confirmDeleteColId, arm: requestDeleteStatus, disarm: cancelDeleteStatus } = useArmedDelete()
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

async function deleteProjectStatus(colId: string) {
  cancelDeleteStatus()
  await $fetch(`/api/statuses/${colId}`, { method: 'DELETE' })
  emit('refresh')
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
        class="flex items-center gap-1 px-2 py-1 rounded-md bg-default border border-primary/60 shrink-0"
      >
        <span
          class="block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <input
          v-model="editingColName"
          type="text"
          aria-label="Status name"
          class="w-24 text-xs font-medium text-highlighted bg-transparent border-0 border-b border-transparent py-0"
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
            ? 'bg-success/10 ring-1 ring-success/30'
            : 'hover:bg-default'"
          @dblclick="startEditStatus(col)"
        >
          <UIcon
            v-if="col.id === doneStatusId"
            name="i-lucide-circle-check-big"
            class="text-xs text-success"
          />
          <span
            v-else
            class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
            :style="{ backgroundColor: col.color || '#a1a1aa' }"
          />
          <!--
            The one place the flat `text-success` is not enough: `--ui-success`
            is the family's 500 step in light mode, which is ~2.5:1 on white —
            fine for the icon and the count beside it, not for the status name.
            The `-700`/`-300` steps are still the app.config family (Nuxt UI
            emits `--color-success-*` from it), so this follows a rebrand; it
            just spells the two ends itself because the token layer offers no
            readable-foreground step.
          -->
          <span
            class="text-xs font-medium"
            :class="col.id === doneStatusId
              ? 'text-success-700 dark:text-success-300'
              : 'text-toned'"
          >{{ col.name }}</span>
          <span
            class="text-xs font-semibold tabular-nums"
            :class="col.id === doneStatusId
              ? 'text-success/70'
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
                class="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs font-medium text-muted hover:text-success hover:bg-success/10 transition-colors"
                @click="setDoneStatus(col.id); colColorPopoverOpen[col.id] = false"
              >
                <UIcon
                  name="i-lucide-circle-check-big"
                  class="text-xs"
                />
                Set as Done
              </button>
              <UiInlineConfirm
                v-if="confirmDeleteColId === col.id"
                label="this status"
                class="px-2 py-1.5"
                @confirm="deleteProjectStatus(col.id); colColorPopoverOpen[col.id] = false"
                @cancel="cancelDeleteStatus"
              />
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
          ? 'bg-success/10 ring-1 ring-success/30'
          : ''"
      >
        <UIcon
          v-if="col.id === doneStatusId"
          name="i-lucide-circle-check-big"
          class="text-xs text-success"
        />
        <span
          v-else
          class="block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
          :style="{ backgroundColor: col.color || '#a1a1aa' }"
        />
        <span
          class="text-xs font-medium"
          :class="col.id === doneStatusId
            ? 'text-success-700 dark:text-success-300'
            : 'text-toned'"
        >{{ col.name }}</span>
        <span
          class="text-xs font-semibold tabular-nums"
          :class="col.id === doneStatusId
            ? 'text-success/70'
            : 'text-dimmed'"
        >{{ col.cardCount ?? 0 }}</span>
      </div>
    </template>

    <!-- Add status (owner/admin) -->
    <UPopover
      v-if="isOwnerOrAdmin"
      v-model:open="showAddColPopover"
    >
      <!-- `hover:bg-default`, not the variant's `bg-elevated`: this trigger sits
           on `bg-muted`, where elevated is the wrong direction. -->
      <UButton
        label="Status"
        icon="i-lucide-plus"
        variant="ghost"
        color="neutral"
        size="xs"
        class="shrink-0 hover:text-primary hover:bg-default"
      />
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
              aria-label="New status name"
              type="text"
              placeholder="Status name..."
              class="flex-1 min-w-0 text-sm font-medium text-highlighted placeholder:text-dimmed bg-transparent border border-accented rounded-md px-2 py-1 transition-colors"
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
