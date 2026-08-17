<script setup lang="ts">
const props = defineProps<{
  cardId: number | null | undefined
  readonly?: boolean
  onBeforeUpload?: () => Promise<void>
  /**
   * A file is being dragged over the card. Owned by the surface rather than by
   * this component, because the drop target is the whole panel — see
   * `useFileDrop`, and the note on the drop row below.
   */
  dragging?: boolean
}>()

const cardIdRef = computed(() => props.cardId ?? null)
const { attachments, uploading, upload, remove, downloadUrl } = useAttachments(cardIdRef)

const canUpload = computed(() => !props.readonly)

const fileInputRef = ref<HTMLInputElement>()

function openFilePicker() {
  if (uploading.value) return
  fileInputRef.value?.click()
}

async function ensureCard() {
  if (!cardIdRef.value && props.onBeforeUpload) {
    await props.onBeforeUpload()
  }
}

/**
 * The one upload path, whether the files came from the picker or from a drop
 * somewhere else on the card. The surface owns the drop and hands them here,
 * because the card that has to exist first — and the composable that knows how
 * to make it — both live on this side.
 */
async function uploadFiles(files: File[]) {
  if (props.readonly || uploading.value || !files.length) return
  try {
    await ensureCard()
  } catch {
    return
  }
  if (!cardIdRef.value) return
  for (const file of files) {
    try {
      await upload(file)
    } catch {
      // upload errors handled by composable
    }
  }
}

async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  await uploadFiles(files)
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Removing an attachment was the only destructive action on either card surface
 * with no confirmation at all — one mis-click on the hover-only trash icon and a
 * screenshot nobody else had a copy of was gone.
 *
 * Inline rather than `UiConfirmDialog`, for both of the reasons `ui/InlineConfirm`
 * records: this list is inside the card panel, where a dialog portals behind it,
 * and it is dense repeated rows whose confirmation has to match the comment rows
 * directly below. No `confirmText` — an attachment is re-uploaded, not recovered.
 */
const { armedId: confirmRemoveId, arm: requestRemove, disarm: cancelRemove } = useArmedDelete()

async function confirmRemove(id: string) {
  cancelRemove()
  await remove(id)
}

/**
 * What the drop row says. Four states in one control, so the thing you aim at and
 * the thing that reports progress are the same object and the section never
 * changes height.
 */
const dropRow = computed(() => {
  if (uploading.value) return { icon: 'i-lucide-loader-2', label: 'Uploading…', spin: true }
  if (props.dragging) return { icon: 'i-lucide-upload', label: 'Drop to upload', spin: false }
  if (attachments.value.length) return { icon: 'i-lucide-plus', label: 'Add another file', spin: false }
  return { icon: 'i-lucide-paperclip', label: 'Add a file, or drop it here', spin: false }
})

defineExpose({ upload, uploadFiles, uploading })
</script>

<template>
  <div v-if="cardId || onBeforeUpload">
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="onFileInputChange"
    >

    <!-- The label arrives with the first attachment.
         An empty section is one row — icon, verb, border — and no heading above
         it, which is the same rule the description's placeholder and the collapsed
         comment composer follow. A heading over a void reads as a section that
         failed to load, and this panel used to show two in a row. Once there is
         something to count, the count is the reason the label earns its place. -->
    <UiSectionLabel
      v-if="attachments.length"
      label="Attachments"
      icon="i-lucide-paperclip"
      :count="attachments.length"
      class="mb-2"
    />

    <div
      v-if="attachments.length"
      class="rounded-lg border border-accented bg-default divide-y divide-default"
    >
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="group flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
      >
        <!-- Thumbnail or icon -->
        <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden bg-elevated">
          <img
            v-if="isImage(attachment.mimeType)"
            :src="downloadUrl(attachment.id)"
            :alt="attachment.originalName"
            class="w-full h-full object-cover"
          >
          <UIcon
            v-else
            :name="fileIcon(attachment.mimeType)"
            class="text-lg text-dimmed"
          />
        </div>

        <!-- File info. `title` rather than a UTooltip: the hint is the row's own
             data behind a truncation, which is the one role CLAUDE.md leaves to
             the native attribute. -->
        <div class="flex-1 min-w-0 flex items-baseline gap-1.5">
          <a
            :href="downloadUrl(attachment.id)"
            target="_blank"
            class="text-sm font-medium text-default hover:text-primary truncate transition-colors"
            :title="attachment.originalName"
          >
            {{ attachment.originalName }}
          </a>
          <span class="text-xs text-dimmed shrink-0">
            {{ formatFileSize(attachment.size) }}
          </span>
        </div>

        <!-- Quiet at rest, like the comment rows'. A pending confirmation stays
             visible regardless: fading out the question you just asked is not a
             hover state. -->
        <div
          v-if="!readonly"
          class="flex items-center gap-0.5 shrink-0 transition-opacity"
          :class="confirmRemoveId === attachment.id
            ? 'opacity-100'
            : 'opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-60'"
        >
          <UiInlineConfirm
            v-if="confirmRemoveId === attachment.id"
            label="this file"
            @confirm="confirmRemove(attachment.id)"
            @cancel="cancelRemove"
          />
          <template v-else>
            <UTooltip text="Download">
              <!-- `external`, or NuxtLink treats `/api/attachments/…` as an app
                   route and pushes it into the router instead of fetching it. -->
              <UButton
                :to="downloadUrl(attachment.id)"
                external
                target="_blank"
                icon="i-lucide-download"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="`Download ${attachment.originalName}`"
              />
            </UTooltip>
            <UTooltip text="Remove">
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="`Remove ${attachment.originalName}`"
                @click="requestRemove(attachment.id)"
              />
            </UTooltip>
          </template>
        </div>
      </div>
    </div>

    <!--
      The drop target is permanent, and that is the point.

      It used to appear only once a drag was already in flight, which meant the
      layout shifted under the cursor at the exact moment it must not move — and
      with nothing on the card there was no target at all, just a 19px "Attach"
      button. Now the target exists before the drag starts, so there is something
      to aim at, and it doubles as the section's empty state and its progress
      readout (see `dropRow`) so the height never changes.

      Solid at rest, and dashed only while a file is over the card.

      It was permanently dashed, on the reasoning that solid means a field you type
      into and dashed means somewhere you drop something. On screen that reasoning
      does not survive: at 1px the dash reads as *fainter* rather than as a
      different kind of thing, so two solid rows and one dashed 24px apart looked
      like an inconsistency rather than a distinction — and nobody learns
      "dashed means droppable" from a single instance anyway. What teaches it is the
      paperclip and the words, both of which are already here.

      The convention is better spent on the state that needs it. Dashed arrives
      with the primary border, the tint and "Drop to upload", at the one moment it
      is legible, and the row is otherwise the same object as the description's
      placeholder and the collapsed comment composer.

      Dropping anywhere on the card works — the handlers belong to the surface,
      not to this rectangle — so this is a target and a label, never a boundary.
    -->
    <button
      v-if="canUpload"
      type="button"
      class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left"
      :class="[
        attachments.length ? 'mt-1.5' : '',
        dragging
          ? 'border-dashed border-primary bg-primary/10 text-primary'
          : 'border-default bg-default text-dimmed hover:bg-muted',
        uploading ? 'cursor-default' : 'cursor-pointer'
      ]"
      :disabled="uploading"
      @click="openFilePicker"
    >
      <UIcon
        :name="dropRow.icon"
        class="text-base shrink-0"
        :class="dropRow.spin ? 'animate-spin text-primary' : ''"
      />
      <span
        class="text-sm"
        :class="dropRow.spin ? 'text-primary font-medium' : ''"
      >{{ dropRow.label }}</span>
    </button>
  </div>
</template>
