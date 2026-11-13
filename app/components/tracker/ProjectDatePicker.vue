<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import type { DateResolution } from '#shared/utils/workflow'
import { DATE_PERIODS, periodStart } from '~/utils/issue-list'

/**
 * The tracker's project date: a day, or a month, quarter, half year or year
 * ("Q4 2026"). A period is stored as its first day with its resolution. A
 * menu, not a form: choosing commits, as every property in the panel does.
 */
const props = defineProps<{
  label: string
  date: string | null
  resolution: DateResolution | null
  /** Read-only for whoever may not edit the project: the popover stays shut. */
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [date: string | null, resolution: DateResolution | null] }>()

const isOpen = ref(false)
const open = computed({
  get: () => isOpen.value && !props.disabled,
  set: (value: boolean) => { isOpen.value = value && !props.disabled }
})

const RESOLUTIONS: Array<{ label: string, value: DateResolution }> = [
  { label: 'Day', value: 'day' },
  { label: 'Month', value: 'month' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Half', value: 'halfYear' },
  { label: 'Year', value: 'year' }
]

const mode = ref<DateResolution>(props.resolution ?? 'day')
const year = ref(Number((props.date ?? new Date().toISOString()).slice(0, 4)))

watch(open, (isOpen) => {
  if (!isOpen) return
  mode.value = props.resolution ?? 'day'
  year.value = Number((props.date ?? new Date().toISOString()).slice(0, 4))
})

const calendarValue = computed({
  get() {
    if (!props.date) return undefined
    const [y, m, d] = props.date.split('-').map(Number) as [number, number, number]
    return new CalendarDate(y, m, d)
  },
  set(val: CalendarDate | undefined) {
    if (!val) return
    choose(`${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`, 'day')
  }
})

const selectedMonth = computed(() => props.date && props.resolution === mode.value && Number(props.date.slice(0, 4)) === year.value
  ? Number(props.date.slice(5, 7))
  : null)

function choose(date: string | null, resolution: DateResolution | null) {
  emit('select', date, resolution)
  open.value = false
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="FIELD_MENU_ALIGN_START"
  >
    <slot />
    <template #content>
      <div class="w-72">
        <div class="flex items-center font-semibold text-highlighted p-1.5 text-sm border-b border-default">
          {{ label }}
        </div>
        <div class="p-2 flex flex-col gap-2">
          <TrackerPillTabs
            :model-value="mode"
            :items="RESOLUTIONS"
            @update:model-value="mode = $event as DateResolution"
          />
          <UCalendar
            v-if="mode === 'day'"
            v-model="calendarValue"
            size="sm"
            color="primary"
          />
          <template v-else>
            <div class="flex items-center justify-between">
              <UButton
                icon="i-lucide-chevron-left"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Previous year"
                @click="year--"
              />
              <span class="text-sm font-medium text-highlighted tabular-nums">{{ year }}</span>
              <UButton
                icon="i-lucide-chevron-right"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Next year"
                @click="year++"
              />
            </div>
            <div class="grid grid-cols-4 gap-1">
              <UButton
                v-for="p in DATE_PERIODS[mode]"
                :key="p.label"
                :label="p.label"
                size="xs"
                block
                :variant="selectedMonth === p.month ? 'soft' : 'ghost'"
                :color="selectedMonth === p.month ? 'primary' : 'neutral'"
                :class="mode === 'year' ? 'col-span-4' : mode === 'halfYear' ? 'col-span-2' : ''"
                @click="choose(periodStart(year, p.month), mode)"
              />
            </div>
          </template>
          <UButton
            v-if="date"
            block
            :label="`Clear ${label.toLowerCase()}`"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            class="hover:text-error hover:bg-error/10"
            @click="choose(null, null)"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
