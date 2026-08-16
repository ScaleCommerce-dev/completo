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
    :content="{ ...FIELD_MENU_ALIGN_START, ...popoverOptions }"
  >
    <slot />
    <template #content>
      <div @click.stop>
        <!--
          The same header the four `FieldMenu` fields carry, hand-written because
          a calendar isn't a list of menu items and so can't be given one by
          passing `type: 'label'`. Classes copied from Nuxt UI's rendered label
          slot rather than approximated: a header that is a point off the others
          is worse than no header, since it reads as a different kind of thing.
        -->
        <div class="w-full flex items-center font-semibold text-highlighted p-1.5 text-sm border-b border-default">
          Due date
        </div>

        <div class="p-1">
          <UCalendar
            v-model="calendarValue"
            size="sm"
            color="primary"
          />
          <!-- Rests neutral and turns error on hover, rather than `color="error"`:
               clearing a date is undoable and this sits under a calendar, so a
               permanently red row would be the loudest thing in the popover. -->
          <UButton
            v-if="modelValue"
            block
            label="Clear due date"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            class="mt-1 hover:text-error hover:bg-error/10"
            @click="clear"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
