<script setup lang="ts">
const props = defineProps<{
  isDone: boolean
  disabled: boolean
  /** Why it is disabled, when that is not obvious: a parent with open sub-tasks. */
  hint?: string
  /** The card's title, so the control is named after the row it belongs to. */
  cardTitle?: string
}>()

/**
 * A checkbox with a name and a state. It was a button named only when it was
 * disabled for open sub-tasks, with no checked state, so every other row
 * announced an unnamed "button" and nothing said whether the card was done.
 */
const label = computed(() => {
  const base = props.cardTitle ? `Done: ${props.cardTitle}` : 'Done'
  return props.hint ? `${base}. ${props.hint}` : base
})

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div
    class="flex items-center justify-center"
    @click.stop
  >
    <!--
      `shrink-0`, and a 44px column. The box is 18px square, but it was a flex
      item in a 36px cell carrying 12px of padding a side — 12px of room for an
      18px control — so it shrank to 12×18 and rendered as a lozenge rather than
      a checkbox on every row of every list.

      An 18px box inside a 24px target. The box was the target, which is under
      the 24px every control on a board card settles at and the smallest thing
      on either view — `before:` gives it the reach without changing what you
      see. The resting border was `border-accented` with `hover:border-accented`
      on top of it, so pointing at the one control on the row that toggles state
      did nothing at all.
    -->
    <UTooltip
      :text="hint"
      :disabled="!hint"
    >
      <span class="inline-flex">
        <button
          type="button"
          class="relative shrink-0 flex items-center justify-center size-[18px] rounded-md border transition-colors before:absolute before:-inset-[3px] before:content-['']"
          :class="isDone
            ? 'bg-success border-success text-white'
            : 'border-accented hover:border-success hover:bg-success/10 text-transparent'"
          role="checkbox"
          :aria-checked="isDone"
          :disabled="disabled"
          :aria-label="label"
          @click="emit('toggle')"
        >
          <UIcon
            v-if="isDone"
            name="i-lucide-check"
            class="text-sm"
          />
        </button>
      </span>
    </UTooltip>
  </div>
</template>
