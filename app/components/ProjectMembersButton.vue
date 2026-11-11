<script setup lang="ts">
/**
 * Who is in the project, in the header, and the door to managing it.
 *
 * Membership used to be a permanent third column on the project page: a list,
 * an Agents section and an invite field, beside the views people come to the
 * page to open, for something that changes a few times in a project's life. The
 * stack answers the everyday question — who is here — and the list moved into
 * a dialog, unchanged.
 *
 * A dialog rather than a popover: the list commits (add, remove, change role),
 * and popovers in this app are menus that commit nothing. It has no footer for
 * the same reason the card panel has none — every change commits as it is made.
 *
 * It is built like Settings beside it — a ghost button, glyph then label — with
 * the faces as the glyph, so the header reads as two matching controls. Faces
 * alone were tried: one avatar at the top right of the page reads as the
 * signed-in account, which is the convention for that corner. People lead,
 * owners first; agents follow and are counted in the "+N".
 */
import { isAgent } from '~/utils/people'

const props = defineProps<{
  projectId: string
  projectName: string
}>()

const { data: members } = useProjectMembers(props.projectId)
const open = ref(false)

const SHOWN = 3

const ordered = computed(() => [...(members.value || [])].sort((a, b) =>
  Number(isAgent(a)) - Number(isAgent(b))
  || Number(b.role === 'owner') - Number(a.role === 'owner')
  || a.name.localeCompare(b.name)))

const shown = computed(() => ordered.value.slice(0, SHOWN))
const overflow = computed(() => ordered.value.length - shown.value.length)

const summary = computed(() => {
  const all = members.value || []
  const agents = all.filter(m => isAgent(m)).length
  const people = all.length - agents
  return [plural(people, 'member'), agents ? plural(agents, 'agent') : ''].filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="flex">
    <UTooltip :text="summary">
      <UButton
        variant="outline"
        color="neutral"
        :aria-label="`Members: ${summary}`"
        class="group/stack"
        @click="open = true"
      >
        <!-- The ring is on a wrapper: `.swatch-avatar` draws its hairline as a
             box-shadow, which is the property `ring-*` writes, and it won.
             A 4px overlap, not 6: at 6 the second initial was cut off. -->
        <!-- Below `sm`, a glyph and the count instead of faces: at 390px the
             stack, Settings and the bell left the project's name four letters. -->
        <span class="flex items-center gap-1 sm:hidden">
          <UIcon
            name="i-lucide-users"
            class="size-5"
          />
          <span class="tabular-nums">{{ members?.length ?? 0 }}</span>
        </span>
        <span class="flex items-center -space-x-1 max-sm:hidden">
          <span
            v-for="m in shown"
            :key="m.id"
            class="flex ring-2 ring-bg"
            :class="isAgent(m) ? 'rounded-md' : 'rounded-full'"
          >
            <UiAvatar
              :src="m.avatarUrl ?? undefined"
              :alt="m.name"
              :kind="m.kind"
              :color="m.color"
              size="xs"
            />
          </span>
          <span
            v-if="overflow > 0"
            class="flex items-center justify-center min-w-6 h-6 px-1 rounded-full bg-elevated text-2xs font-bold tabular-nums text-muted ring-2 ring-bg group-hover/stack:bg-accented transition-colors"
          >+{{ overflow }}</span>
        </span>
        <span class="max-sm:hidden">Members</span>
      </UButton>
    </UTooltip>

    <UiModal
      v-model:open="open"
      icon="i-lucide-users"
      title="Members"
      :description="`People and agents with access to ${projectName}`"
    >
      <template #body>
        <ProjectMembers
          :project-id="projectId"
          :project-name="projectName"
        />
      </template>
    </UiModal>
  </div>
</template>
