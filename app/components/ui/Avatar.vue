<script setup lang="ts">
/**
 * A person's avatar, and an agent's. Every `UAvatar` in the app is one of these,
 * and all thirteen of them passed `:src` + `:alt="someone.name"`, which is why
 * this is a drop-in rename rather than a new prop shape.
 *
 * What it adds is the colour. With no photo, `UAvatar` renders initials on
 * `bg-elevated`, so a screen showing several people showed several identical
 * grey discs; the comment thread, whose entire structure is its avatar column
 * (see `CommentList`), was the surface where that actually cost something.
 * `identityColor()` derives a stable hue from the name and the existing
 * `.swatch` recipe makes it readable in both themes — the same machinery a tag
 * pill uses, so user-coloured surfaces stay on one recipe.
 *
 * Photos are left alone: an image already differentiates, and tinting behind one
 * paints a fill nothing can see.
 *
 * **An agent is a rounded square with the bot glyph** instead of a disc of
 * initials. The shape has to work with no name beside it, which is how the
 * board's assignee slot draws one: at 16 and 20px the glyph carries it, from
 * 24px the corners do too. A corner badge on a disc was the alternative and has
 * no room at 16px, where the notification list already hangs its type badge on
 * that corner. Its tint is the colour its creator picked (`color`), through the
 * same `.swatch-avatar` recipe, so a dark stored hex stays legible;
 * `design-tokens.test.ts` holds the glyph to the disc's contrast for every
 * colour `COLOR_PALETTE` offers.
 */
const props = withDefaults(defineProps<{
  src?: string | null
  /** Display name. Also the tint seed and the initials `UAvatar` derives. */
  alt?: string | null
  size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  /**
   * `false` keeps the neutral disc — for a slot with no person in it, such as a
   * comment whose author has been deleted. Absent data should look absent, and a
   * confident colour on a name nobody owns reads as an identity.
   */
  tint?: boolean
  /** `agent` draws the square with the bot glyph. */
  kind?: 'human' | 'agent' | null
  /** A stored tint, which wins over the name's derived one. Agents have one; people do not. */
  color?: string | null
}>(), {
  size: 'xs',
  tint: true
})

const isAgent = computed(() => props.kind === 'agent')

const swatch = computed(() => (props.tint && !props.src ? (props.color || identityColor(props.alt)) : null))

/**
 * The glyph is sized as a box rather than a font step, because UAvatar sizes its
 * icon off the root's font size: 8px at `3xs`, where the glyph needs 10. About
 * 60% of the side at every size, which is where the bot's antenna stops touching
 * the corners.
 */
const GLYPH = {
  '3xs': 'size-2.5',
  '2xs': 'size-3',
  'xs': 'size-3.5',
  'sm': 'size-4',
  'md': 'size-4.5',
  'lg': 'size-5',
  'xl': 'size-5.5',
  '2xl': 'size-6',
  '3xl': 'size-7'
} as const

const ui = computed(() => isAgent.value
  ? { root: 'rounded-md', icon: GLYPH[props.size] }
  : { fallback: 'font-semibold' })
</script>

<template>
  <UAvatar
    :src="src || undefined"
    :alt="alt || undefined"
    :size="size"
    :icon="isAgent ? 'i-lucide-bot' : undefined"
    :class="swatch ? 'swatch-avatar' : undefined"
    :style="swatch ? { '--swatch': swatch } : undefined"
    :ui="ui"
  />
</template>
