<script setup lang="ts">
const props = defineProps<{
  cardId: number | null | undefined
  readonly?: boolean
}>()

const cardIdRef = computed(() => props.cardId ?? null)
const { attachments, uploading, upload, remove, downloadUrl } = useAttachments(cardIdRef)

const fileInputRef = ref<HTMLInputElement>()

function openFilePicker() {
  if (uploading.value) return
  fileInputRef.value?.click()
}

async function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (files?.length) {
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
  <div v-if="cardId">
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
        class="text-[13px] text-zinc-400 dark:text-zinc-500"
      />
      <span class="text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500">Attachments</span>
      <span
        v-if="attachments.length"
        class="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full"
      >
        {{ attachments.length }}
      </span>
    </div>

    <!-- Uploading indicator -->
    <div
      v-if="uploading"
      class="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20 mb-2"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="text-[14px] text-indigo-500 animate-spin"
      />
      <span class="text-[12px] font-medium text-indigo-500">Uploading...</span>
    </div>

    <!-- Attachment list -->
    <div
      v-if="attachments.length"
      class="rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 divide-y divide-zinc-100 dark:divide-zinc-700/40"
    >
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="group flex items-center gap-2.5 px-2.5 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors first:rounded-t-lg last:rounded-b-lg"
      >
        <!-- Thumbnail or icon -->
        <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <img
            v-if="isImage(attachment.mimeType)"
            :src="downloadUrl(attachment.id)"
            :alt="attachment.originalName"
            class="w-full h-full object-cover"
          >
          <UIcon
            v-else
            :name="fileIcon(attachment.mimeType)"
            class="text-[16px] text-zinc-400 dark:text-zinc-500"
          />
        </div>

        <!-- File info -->
        <div class="flex-1 min-w-0 flex items-baseline gap-1.5">
          <a
            :href="downloadUrl(attachment.id)"
            target="_blank"
            class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-indigo-500 dark:hover:text-indigo-400 truncate transition-colors"
            :title="attachment.originalName"
          >
            {{ attachment.originalName }}
          </a>
          <span class="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
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
            class="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
            title="Download"
          >
            <UIcon
              name="i-lucide-download"
              class="text-[13px]"
            />
          </a>
          <button
            type="button"
            class="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 transition-all"
            title="Remove"
            @click="remove(attachment.id)"
          >
            <UIcon
              name="i-lucide-trash-2"
              class="text-[13px]"
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
          ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
          : 'border-zinc-200 dark:border-zinc-700/60 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      ]"
      @click="openFilePicker"
      @dragenter="onDropZoneDragEnter"
      @dragover="onDropZoneDragOver"
      @dragleave="onDropZoneDragLeave"
      @drop="onDropZoneDrop"
    >
      <UIcon
        :name="dropActive ? 'i-lucide-upload-cloud' : 'i-lucide-plus'"
        class="text-[14px]"
        :class="dropActive ? 'text-indigo-500' : 'text-zinc-400 dark:text-zinc-500'"
      />
      <span
        class="text-[12px] font-medium"
        :class="dropActive ? 'text-indigo-500' : 'text-zinc-400 dark:text-zinc-500'"
      >
        {{ dropActive ? 'Drop to upload' : 'Drop files here or click to browse' }}
      </span>
    </button>

    <!-- Empty note when readonly -->
    <p
      v-else-if="!attachments.length && !uploading"
      class="text-[12px] text-zinc-400 dark:text-zinc-500 italic"
    >
      No attachments
    </p>
  </div>
</template>
