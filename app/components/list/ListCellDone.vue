<script setup lang="ts">
defineProps<{
  isDone: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div
    class="flex items-center justify-center"
    @click.stop
  >
    <button
      type="button"
      class="flex items-center justify-center w-[18px] h-[18px] rounded-md border transition-all"
      :class="isDone
        ? 'bg-success border-success text-white'
        : 'border-accented hover:border-accented text-transparent'"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <UIcon
        v-if="isDone"
        name="i-lucide-check"
        class="text-sm"
      />
    </button>
  </div>
</template>
