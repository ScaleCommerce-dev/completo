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
          <button
            v-if="modelValue"
            type="button"
            class="w-full mt-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-muted hover:text-error hover:bg-error/10 transition-colors"
            @click="clear"
          >
            <UIcon
              name="i-lucide-x"
              class="text-xs"
            />
            Clear due date
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
