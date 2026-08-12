<script setup lang="ts">
const props = defineProps<{
  name: string
  message: string
  loading?: boolean
}>()

const show = defineModel<boolean>('show', { default: false })

const emit = defineEmits<{
  confirm: []
}>()

const confirmName = ref('')
const valid = computed(() =>
  confirmName.value.trim() === props.name.trim()
)

watch(show, (isOpen) => {
  if (isOpen) confirmName.value = ''
})

function onConfirm() {
  if (!valid.value) return
  emit('confirm')
}
</script>

<template>
  <div
    v-if="show"
    class="rounded-lg border border-error/30 bg-red-50/50 dark:bg-red-950/20 p-3"
  >
    <p class="text-sm font-medium text-error mb-2">
      {{ message }} Type <span class="font-bold">{{ name }}</span> to confirm.
    </p>
    <div class="flex items-center gap-2">
      <input
        v-model="confirmName"
        type="text"
        :placeholder="name"
        class="flex-1 text-base text-highlighted placeholder-zinc-300 dark:placeholder-zinc-600 bg-default border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
      >
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!valid || loading"
        @click="onConfirm"
      >
        <UIcon
          v-if="!loading"
          name="i-lucide-trash-2"
          class="text-sm"
        />
        <UIcon
          v-else
          name="i-lucide-loader-2"
          class="text-sm animate-spin"
        />
        Delete
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-dimmed hover:text-toned hover:bg-elevated transition-colors"
        @click="show = false"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
