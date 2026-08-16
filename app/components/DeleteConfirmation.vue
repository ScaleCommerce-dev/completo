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
    class="rounded-lg border border-error/30 bg-error/5 p-3"
  >
    <p class="text-sm font-medium text-error mb-2">
      {{ message }} Type <span class="font-bold">{{ name }}</span> to confirm.
    </p>
    <div class="flex items-center gap-2">
      <input
        v-model="confirmName"
        type="text"
        :aria-label="`Type ${name} to confirm`"
        :placeholder="name"
        class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-default border border-error/30 rounded-lg px-2.5 py-1.5 focus:border-error/60 transition-colors"
      >
      <!-- Cancel then Delete, not the reverse. The field takes the row's left
           end, so the terminal end here is the right one and the primary belongs
           there — the same rule every other action row in the app follows. This
           was the only row that broke it, and the only one mixing a `UButton`
           with a hand-rolled `<button>`, which meant two systems setting the
           height of two controls standing side by side. -->
      <UButton
        label="Cancel"
        variant="ghost"
        color="neutral"
        @click="show = false"
      />
      <UButton
        color="error"
        icon="i-lucide-trash-2"
        label="Delete"
        :loading="loading"
        :disabled="!valid || loading"
        @click="onConfirm"
      />
    </div>
  </div>
</template>
