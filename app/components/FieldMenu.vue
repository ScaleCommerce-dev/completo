<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { FieldMenuOption } from '~/types/field-menu'

/**
 * The one menu behind status, priority, assignee and tags.
 *
 * All four are the same interaction — pick from a list, the chosen ones are
 * marked — and whether you may pick one or several is not a reason to look
 * different. They had drifted into five implementations regardless: two
 * `UDropdownMenu`s on the board card, three hand-rolled `UPopover` + button
 * lists in the list cells (with `min-w` of 140, 160 and 180 and three slightly
 * different ways of marking the selected row), and a sixth in the card panel
 * whose status options carried no colour dot at all. The due date is the only
 * field that is genuinely something else — a calendar is a grid widget, not a
 * list of commands — and it stays a popover.
 *
 * Two details do the work:
 *
 *  - **A header.** Every menu names the field it edits, so an icon-only trigger
 *    is not the only thing telling you what you opened.
 *  - **A fixed 16px leading box.** Nuxt UI's menu item is `flex items-start`,
 *    which is right for a 16px icon beside a wrapping label and wrong for an 8px
 *    dot — the tag and status dots sat 5px above the centre of their row. Every
 *    mark now renders centred in the same box, so a dot, a glyph and a face all
 *    land on one left edge and one baseline.
 *
 * `multiple` only changes whether choosing closes the menu. Tags stay open
 * because picking several is the point; the rest close, because picking one is
 * the whole interaction.
 */
const props = defineProps<{
  /** Names the field in the menu header. */
  label: string
  options: FieldMenuOption[]
  multiple?: boolean
  content?: Record<string, unknown>
}>()

const open = defineModel<boolean | undefined>('open')

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: props.label, type: 'label' as const }],
  props.options.map(o => ({
    label: o.label,
    type: 'checkbox' as const,
    checked: o.checked,
    option: o,
    onSelect(e: Event) {
      // A menu item closes on choose unless told otherwise.
      if (props.multiple) e.preventDefault()
      o.onSelect()
    }
  }))
])

/**
 * Focus goes back to the trigger only when the keyboard opened the menu — see
 * `useMenuFocusReturn`. Merged into `content` rather than exposed as a prop:
 * every menu in the app wants this, and none should have to remember it.
 */
const { onCloseAutoFocus } = useMenuFocusReturn(open)

const contentProps = computed(() => ({
  align: 'start' as const,
  side: 'bottom' as const,
  sideOffset: 4,
  collisionPadding: 8,
  ...props.content,
  onCloseAutoFocus
}))

/** The header item has no option, so the leading box is skipped for it. */
const opt = (item: unknown) => (item as { option?: FieldMenuOption }).option
</script>

<template>
  <UDropdownMenu
    v-model:open="open"
    :items="items"
    :content="contentProps"
    :ui="{
      content: 'min-w-[200px] max-h-80 overflow-y-auto thin-scroll',
      // The default check is `size-5` — taller than the 18px line box, so the
      // one selected row in every menu sat ~1px taller than its neighbours and
      // pushed its own leading mark off centre. At `size-4` it fits the line and
      // the rows stay on one rhythm.
      itemTrailingIcon: 'size-4'
    }"
  >
    <slot />

    <template #item-leading="{ item }">
      <!--
        `h-[1lh]`, not a fixed height: the item is `flex items-start`, so the box
        must be exactly one line tall to sit on the label's centre — `self-center`
        would instead centre against a wrapped two-line label and float the mark
        between its lines. `1lh` resolves to whatever the item's line-height is,
        so nothing here breaks if the type scale moves.
      -->
      <span
        v-if="opt(item)"
        class="flex items-center justify-center w-4 h-[1lh] shrink-0"
      >
        <UiStatusDot
          v-if="opt(item)!.swatch !== undefined || opt(item)!.done"
          :color="opt(item)!.swatch"
          :done="opt(item)!.done"
          size="sm"
        />
        <UAvatar
          v-else-if="opt(item)!.avatar"
          :src="opt(item)!.avatar!.src"
          :alt="opt(item)!.avatar!.alt"
          size="3xs"
        />
        <UIcon
          v-else-if="opt(item)!.icon"
          :name="opt(item)!.icon!"
          class="text-sm"
          :class="opt(item)!.iconClass"
        />
      </span>
    </template>
  </UDropdownMenu>
</template>
