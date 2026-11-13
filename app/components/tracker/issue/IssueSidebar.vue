<script setup lang="ts">
import type { RelationKind } from '#shared/utils/workflow'
import type { FieldMenuOption } from '~/types/field-menu'

/**
 * What the tracker issue page adds under the card's properties, in the tracker's
 * order: the project with its milestone, then the three relation lists. The
 * properties themselves stay `CardProperties`, shared with the panel. Every
 * control commits on choose and the page does the saving, so this only says
 * what was chosen.
 */
const props = defineProps<{ card: TrackerIssueCard }>()

const emit = defineEmits<{
  update: [updates: Record<string, unknown>]
  addRelation: [type: RelationKind, cardId: number]
  removeRelation: [relationId: string]
}>()

const { projects } = useNavigation()

const projectOptions = computed<FieldMenuOption[]>(() => (projects.value ?? []).map(p => ({
  label: p.name,
  checked: p.id === props.card.projectId,
  icon: projectIcon(p.icon),
  iconClass: 'text-dimmed',
  onSelect: () => {
    if (p.id !== props.card.projectId) emit('update', { projectId: p.id })
  }
})))

const currentProject = computed(() => projects.value?.find(p => p.id === props.card.projectId))

const { data: milestones } = useFetch<Array<{ id: string, name: string }>>(
  () => `/api/projects/${props.card.projectId}/milestones`,
  { default: () => [] }
)

const milestoneOptions = computed<FieldMenuOption[]>(() => [
  { id: null as string | null, name: 'No milestone' },
  ...(milestones.value || [])
].map(m => ({
  label: m.name,
  checked: (props.card.milestoneId ?? null) === m.id,
  icon: m.id ? 'i-lucide-diamond' : 'i-lucide-circle-off',
  iconClass: 'text-dimmed',
  onSelect: () => emit('update', { milestoneId: m.id })
})))

/** Everything a relation may not point at: the card and what it already names. */
const related = computed(() => [
  props.card.id,
  ...props.card.relations.blocks.map(r => r.id),
  ...props.card.relations.blockedBy.map(r => r.id),
  ...props.card.relations.relates.map(r => r.id)
])

/** One row of the list: the value with no label column. */
const ROW = 'flex items-center gap-2 w-full -mx-2 px-2 h-8 rounded-md text-sm text-default hover:bg-elevated transition-colors cursor-pointer'
</script>

<template>
  <div class="flex flex-col gap-6">
    <section>
      <h3 class="text-sm font-medium text-muted mb-1.5">
        Project
      </h3>
      <FieldMenu
        label="Project"
        :options="projectOptions"
        :content="FIELD_MENU_ALIGN_START"
      >
        <button
          type="button"
          :class="ROW"
          :aria-label="`Project: ${card.project?.name}. Move to another project`"
        >
          <UIcon
            :name="projectIcon(currentProject?.icon)"
            class="size-3.5 text-muted"
          />
          <span class="truncate">{{ card.project?.name }}</span>
        </button>
      </FieldMenu>
      <!-- The milestone hangs off its project. -->
      <div class="ml-1.5 pl-3 border-l border-default">
        <FieldMenu
          label="Milestone"
          :options="milestoneOptions"
          :content="FIELD_MENU_ALIGN_START"
        >
          <button
            type="button"
            :class="ROW"
            :aria-label="`Milestone: ${card.milestone?.name ?? 'none'}`"
          >
            <UIcon
              name="i-lucide-diamond"
              class="size-3.5"
              :class="card.milestone ? 'text-warning' : 'text-dimmed'"
            />
            <span
              class="truncate"
              :class="card.milestone ? '' : 'text-muted'"
            >{{ card.milestone?.name ?? 'Add milestone' }}</span>
          </button>
        </FieldMenu>
      </div>
    </section>

    <TrackerIssueRelationSection
      label="Blocking"
      placeholder="Mark as blocking..."
      :items="card.relations.blocks"
      :project-id="card.projectId"
      :exclude="related"
      @add="emit('addRelation', 'blocks', $event)"
      @remove="emit('removeRelation', $event)"
    />
    <TrackerIssueRelationSection
      label="Blocked by"
      placeholder="Mark as blocked by..."
      :items="card.relations.blockedBy"
      :project-id="card.projectId"
      :exclude="related"
      @add="emit('addRelation', 'blocked_by', $event)"
      @remove="emit('removeRelation', $event)"
    />
    <TrackerIssueRelationSection
      label="Related"
      placeholder="Relate to..."
      :items="card.relations.relates"
      :project-id="card.projectId"
      :exclude="related"
      @add="emit('addRelation', 'relates', $event)"
      @remove="emit('removeRelation', $event)"
    />
  </div>
</template>
