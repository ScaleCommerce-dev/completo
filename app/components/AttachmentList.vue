<script setup lang="ts">
const props = defineProps<{
  cardId: number | null | undefined
  readonly?: boolean
  onBeforeUpload?: () => Promise<void>
}>()

const cardIdRef = computed(() => props.cardId ?? null)
const { attachments, uploading, upload, remove, downloadUrl } = useAttachments(cardIdRef)

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

async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (files?.length) {
    try {
      await ensureCard()
    } catch {
      input.value = ''
      return
    }
    if (!cardIdRef.value) {
      input.value = ''
      return
    }
    for (const file of files) {
      try {
        await upload(file)
      } catch {
        // upload errors handled by composable
      }
    }
  }
  input.value = ''
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// ─── Drop Zone ───
const dropActive = ref(false)
let dropLeaveTimeout: ReturnType<typeof setTimeout> | null = null

function onDropZoneDragEnter(e: DragEvent) {
  if (props.readonly || !e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  if (dropLeaveTimeout) {
    clearTimeout(dropLeaveTimeout)
    dropLeaveTimeout = null
  }
  dropActive.value = true
}

function onDropZoneDragOver(e: DragEvent) {
  if (props.readonly || !e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
}

function onDropZoneDragLeave() {
  if (dropLeaveTimeout) clearTimeout(dropLeaveTimeout)
  dropLeaveTimeout = setTimeout(() => {
    dropActive.value = false
  }, 50)
}

async function onDropZoneDrop(e: DragEvent) {
  e.preventDefault()
  dropActive.value = false
  if (props.readonly || uploading.value) return
  const files = e.dataTransfer?.files
  if (!files?.length) return
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

defineExpose({ upload, uploading })
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

    <!-- Header -->
    <div class="flex items-center gap-1.5 mb-2">
      <UIcon
        name="i-lucide-paperclip"
        class="text-sm text-dimmed"
      />
      <span class="text-xs font-semibold uppercase tracking-[0.04em] text-dimmed">Attachments</span>
      <span
        v-if="attachments.length"
        class="text-xs font-semibold text-dimmed bg-elevated px-1.5 py-0.5 rounded-full"
      >
        {{ attachments.length }}
      </span>
    </div>

    <!-- Uploading indicator -->
    <div
      v-if="uploading"
      class="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/60 border-primary bg-primary/15 bg-primary/20 mb-2"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="text-base text-primary animate-spin"
      />
      <span class="text-xs font-medium text-primary">Uploading...</span>
    </div>

    <!-- Attachment list -->
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

        <!-- File info -->
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

        <!-- Actions -->
        <div
          v-if="!readonly"
          class="flex items-center gap-1 shrink-0"
        >
          <a
            :href="downloadUrl(attachment.id)"
            target="_blank"
            class="p-1 rounded-md text-dimmed hover:text-toned hover:bg-elevated opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
            title="Download"
          >
            <UIcon
              name="i-lucide-download"
              class="text-sm"
            />
          </a>
          <button
            type="button"
            class="p-1 rounded-md text-dimmed hover:text-error hover:bg-error/10 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
            title="Remove"
            @click="remove(attachment.id)"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="text-sm"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Drop zone (not readonly, not currently uploading) -->
    <button
      v-if="!readonly && !uploading"
      type="button"
      class="w-full flex items-center justify-center gap-2 px-3 rounded-lg border border-dashed transition-all cursor-pointer"
      :class="[
        attachments.length ? 'py-2 mt-1.5' : 'py-4',
        dropActive
          ? 'border-primary bg-primary/15 bg-primary/10'
          : 'border-accented hover:border-accented hover:bg-muted'
      ]"
      @click="openFilePicker"
      @dragenter="onDropZoneDragEnter"
      @dragover="onDropZoneDragOver"
      @dragleave="onDropZoneDragLeave"
      @drop="onDropZoneDrop"
    >
      <UIcon
        :name="dropActive ? 'i-lucide-upload-cloud' : 'i-lucide-plus'"
        class="text-base"
        :class="dropActive ? 'text-primary' : 'text-dimmed'"
      />
      <span
        class="text-xs font-medium"
        :class="dropActive ? 'text-primary' : 'text-dimmed'"
      >
        {{ dropActive ? 'Drop to upload' : 'Drop files here or click to browse' }}
      </span>
    </button>

    <!-- Empty note when readonly -->
    <p
      v-else-if="!attachments.length && !uploading"
      class="text-xs text-dimmed italic"
    >
      No attachments yet
    </p>
  </div>
</template>
