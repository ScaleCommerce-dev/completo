<script setup lang="ts">
/**
 * A person's avatar. Every `UAvatar` in the app is one of these — there is no
 * call site that puts something other than a human in the disc — and all
 * thirteen of them passed `:src` + `:alt="someone.name"`, which is why this is a
 * drop-in rename rather than a new prop shape.
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
}>(), {
  size: 'xs',
  tint: true
})

const swatch = computed(() => (props.tint && !props.src ? identityColor(props.alt) : null))
</script>

<template>
  <UAvatar
    :src="src || undefined"
    :alt="alt || undefined"
    :size="size"
    :class="swatch ? 'swatch-avatar' : undefined"
    :style="swatch ? { '--swatch': swatch } : undefined"
    :ui="{ fallback: 'font-semibold' }"
  />
</template>
