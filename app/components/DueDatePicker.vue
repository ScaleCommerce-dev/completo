<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'

const props = defineProps<{
  modelValue: string | null | undefined
  popoverOptions?: Record<string, unknown>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const calendarValue = computed({
  get() {
    if (!props.modelValue) return undefined
    const d = new Date(props.modelValue)
    return new CalendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  },
  set(val: CalendarDate | undefined) {
    if (!val) {
      emit('update:modelValue', null)
    } else {
      emit('update:modelValue', `${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`)
    }
    open.value = false
  }
})

function clear() {
  emit('update:modelValue', null)
  open.value = false
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="popoverOptions || { align: 'start', side: 'bottom', sideOffset: 4, collisionPadding: 8 }"
  >
    <slot />
    <template #content>
      <div
        class="p-1"
        @click.stop
      >
        <UCalendar
          v-model="calendarValue"
          size="sm"
          color="primary"
        />
        <button
          v-if="modelValue"
          type="button"
          class="w-full mt-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
          @click="clear"
        >
          <UIcon
            name="i-lucide-x"
            class="text-[12px]"
          />
          Clear due date
        </button>
      </div>
    </template>
  </UPopover>
</template>
