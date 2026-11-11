<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { FieldMenuOption, FieldMenuSection } from '~/types/field-menu'

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
 *
 * **Past ten entries it grows a search row**, the one `MentionPicker` already
 * has, because a project with agents can put thirty names in the assignee menu
 * and scrolling a list that long is slower than typing two letters. By default
 * the menu filters its own options by label. A caller with its own rule (the
 * assignee menu, which caps other people's agents until there is a query) takes
 * the term through `v-model:search-term` and passes `own-filter`.
 */
const props = withDefaults(defineProps<{
  /** Names the field in the menu header. */
  label: string
  /** One unlabelled run of options. Use `sections` for labelled groups instead. */
  options?: FieldMenuOption[]
  sections?: FieldMenuSection[]
  multiple?: boolean
  content?: Record<string, unknown>
  /** Force the search row on or off; by default it shows past `SEARCH_FROM` options. */
  searchable?: boolean
  /** The caller filters (via `searchTerm`); the menu shows what it is given. */
  ownFilter?: boolean
}>(), {
  // Vue reads an absent Boolean prop as `false` unless it has a default, which
  // would leave the count below unreachable.
  searchable: undefined
})

const open = defineModel<boolean | undefined>('open')
const searchTerm = defineModel<string>('searchTerm', { default: '' })

/** The list length past which typing beats scrolling. */
const SEARCH_FROM = 10

const allSections = computed<FieldMenuSection[]>(() => props.sections ?? [{ options: props.options ?? [] }])

const showSearch = computed(() => props.searchable
  ?? allSections.value.reduce((n, s) => n + s.options.length, 0) > SEARCH_FROM)

// A term left over from the last time the menu was open would open it filtered.
watch(open, (isOpen) => {
  if (!isOpen) searchTerm.value = ''
})

function toItem(o: FieldMenuOption): DropdownMenuItem {
  return {
    label: o.label,
    type: 'checkbox' as const,
    checked: o.checked,
    option: o,
    onSelect(e: Event) {
      // A menu item closes on choose unless told otherwise.
      if (props.multiple) e.preventDefault()
      o.onSelect()
    }
  }
}

/**
 * Section labels wear the app's small uppercase label rather than the header's
 * weight, so the header still reads as the one thing naming the field. Spelled
 * without a font size: the item's size variant sets one, and tailwind-merge reads
 * a custom step like `text-2xs` as a *colour*, which would knock out the colour
 * beside it.
 */
const SECTION_LABEL = 'uppercase tracking-label text-dimmed'
const NOTE = 'font-normal text-dimmed'

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: props.label, type: 'label' as const }],
  ...allSections.value
    .filter(s => s.options.length || s.note)
    .map(s => [
      ...(s.label ? [{ label: s.label, type: 'label' as const, count: s.count, ui: { label: SECTION_LABEL } }] : []),
      ...s.options.map(toItem),
      ...(s.note ? [{ label: s.note, type: 'label' as const, ui: { label: NOTE } }] : [])
    ])
])

/**
 * Focus goes back to the trigger only when the keyboard opened the menu — see
 * `useMenuFocusReturn`. Merged into `content` rather than exposed as a prop:
 * every menu in the app wants this, and none should have to remember it.
 */
const { onCloseAutoFocus } = useMenuFocusReturn(open)

const contentProps = computed(() => ({
  ...FIELD_MENU_ALIGN_START,
  ...props.content,
  onCloseAutoFocus
}))

/** The header item has no option, so the leading box is skipped for it. */
const opt = (item: unknown) => (item as { option?: FieldMenuOption }).option

/** A section label's count, when it shows only part of its group. */
const countOf = (item: unknown) => (item as { count?: number }).count
</script>

<template>
  <UDropdownMenu
    v-model:open="open"
    v-model:search-term="searchTerm"
    :items="items"
    :filter="showSearch ? { placeholder: `Search ${label.toLowerCase()}…` } : false"
    :ignore-filter="ownFilter"
    :content="contentProps"
    :ui="{
      // The list scrolls rather than the whole menu, so the search row stays
      // put above it; without a search row the two are the same thing.
      content: 'min-w-[200px] max-h-80',
      viewport: 'thin-scroll',
      // The search row's input has no edge of its own; the row's hairline is
      // the boundary that turns primary, as on `MentionPicker`'s shell.
      input: 'focus-within:border-primary',
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
        <UiAvatar
          v-else-if="opt(item)!.avatar"
          :src="opt(item)!.avatar!.src"
          :alt="opt(item)!.avatar!.alt"
          :kind="opt(item)!.avatar!.kind"
          :color="opt(item)!.avatar!.color"
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

    <template #item-trailing="{ item }">
      <span
        v-if="countOf(item) !== undefined"
        class="font-mono tabular-nums normal-case tracking-normal"
      >{{ countOf(item) }}</span>
    </template>
  </UDropdownMenu>
</template>
