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
  <div v-if="show" class="rounded-lg border border-red-200/60 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3">
    <p class="text-[13px] font-medium text-red-600 dark:text-red-400 mb-2">
      {{ message }} Type <span class="font-bold">{{ name }}</span> to confirm.
    </p>
    <div class="flex items-center gap-2">
      <input
        v-model="confirmName"
        type="text"
        :placeholder="name"
        class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-800/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-400 dark:focus:border-red-600 transition-colors"
      />
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!valid || loading"
        @click="onConfirm"
      >
        <UIcon v-if="!loading" name="i-lucide-trash-2" class="text-[13px]" />
        <UIcon v-else name="i-lucide-loader-2" class="text-[13px] animate-spin" />
        Delete
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
        @click="show = false"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
