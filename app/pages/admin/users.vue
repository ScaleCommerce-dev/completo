<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { TableColumn } from '@nuxt/ui/runtime/components/Table.vue'
import type { HandOverAction } from '~/types/agent'

definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'Users · Completo' })

interface AdminUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  isAdmin: boolean
  suspendedAt: string | null
  pendingSetup: boolean
  lastSeenAt: string | null
  /** The permission alone; admins can create agents regardless. */
  canCreateAgents: boolean
  agentCount: number
  activeAgentCount: number
}

interface PendingInvitation {
  id: string
  email: string
  projectId: string
  projectName: string
  inviterName: string
}

const { user: currentUser } = useUserSession()
const { data: users, refresh } = await useFetch<AdminUser[]>('/api/admin/users')
const { data: pendingInvitations, refresh: refreshInvitations } = await useFetch<PendingInvitation[]>('/api/admin/invitations')

// Delete user state
const showDeleteModal = ref(false)
const deleteTarget = ref<AdminUser | null>(null)
const deleteError = ref('')
const deleting = ref(false)

function openDelete(user: AdminUser) {
  if (user.id === currentUser.value?.id) return
  // Known up front, so the one dialog asks both questions.
  if (user.activeAgentCount > 0) {
    openHandOver(user, 'delete', () => deleteUser(user))
    return
  }
  deleteTarget.value = user
  deleteError.value = ''
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const target = deleteTarget.value
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteUser(target)
    showDeleteModal.value = false
    deleteTarget.value = null
  } catch (e: unknown) {
    // Agents were added since this page loaded: same dialog as if we had known.
    if (agentsInTheWay(e)) {
      showDeleteModal.value = false
      openHandOver(target, 'delete', () => deleteUser(target))
    } else {
      deleteError.value = getErrorMessage(e, 'Failed to delete user')
    }
  } finally {
    deleting.value = false
  }
}

async function deleteUser(u: AdminUser) {
  await $fetch(`/api/user/${u.id}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: `${u.name} deleted`, color: 'success' })
}

// ─── Agents in the way ───────────────────────────────────────────────────────
/**
 * Deleting, suspending, demoting or revoking the permission of someone who still
 * manages active agents is refused with a 409 until their agents have a new
 * manager or are suspended. The hand-over dialog makes that choice and then runs
 * the original change again, so the admin answers one question rather than two.
 */
function agentsInTheWay(e: unknown) {
  const err = e as { statusCode?: number, data?: { data?: { agentCount?: number } } }
  return err?.statusCode === 409 && !!err.data?.data?.agentCount
}

const handOver = ref<{ person: AdminUser, action: HandOverAction, proceed: () => Promise<void> } | null>(null)
const showHandOver = ref(false)

function openHandOver(person: AdminUser, action: HandOverAction, proceed: () => Promise<void>) {
  handOver.value = { person, action, proceed }
  showHandOver.value = true
}

/** Run a change, or hand their agents over first when the server says it has to. */
async function withHandOver(u: AdminUser, action: HandOverAction, change: () => Promise<void>) {
  actionLoading.value = u.id
  try {
    await change()
  } catch (e: unknown) {
    if (agentsInTheWay(e)) openHandOver(u, action, change)
    else toast.add({ title: 'Failed to update user', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    actionLoading.value = null
  }
}

// Badge actions
const actionLoading = ref<string | null>(null)

async function resendSetup(u: AdminUser) {
  actionLoading.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}/resend-setup`, { method: 'POST' })
    toast.add({ title: 'Setup email resent', description: `Sent to ${u.email}`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to resend setup email', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    actionLoading.value = null
  }
}

function toggleSuspend(u: AdminUser) {
  return withHandOver(u, 'suspend', async () => {
    await $fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { suspended: !u.suspendedAt }
    })
    await refresh()
    toast.add({ title: u.suspendedAt ? `${u.name} unsuspended` : `${u.name} suspended`, color: 'success' })
  })
}

function toggleAdmin(u: AdminUser) {
  return withHandOver(u, 'demote', async () => {
    const result = await $fetch<{ removedFrom?: unknown[] }>(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { isAdmin: !u.isAdmin }
    })
    await refresh()
    // Demoted: their agents, suspended ones too, stay only in projects they are
    // themselves in.
    const left = result?.removedFrom?.length ?? 0
    toast.add({
      title: `${u.name} is now ${u.isAdmin ? 'a regular user' : 'an admin'}`,
      description: left ? `Their agents left ${plural(left, 'project membership')} outside ${u.name}'s projects.` : undefined,
      color: 'success'
    })
  })
}

function toggleCanCreateAgents(u: AdminUser) {
  return withHandOver(u, 'revoke', async () => {
    await $fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { canCreateAgents: !u.canCreateAgents }
    })
    await refresh()
    toast.add({ title: u.canCreateAgents ? `${u.name} can no longer create agents` : `${u.name} can create agents`, color: 'success' })
  })
}

/**
 * Only exceptions get a badge, but the two columns differ in what "no badge" means.
 *
 * **Role** — every account has one, so an empty cell would be a lie (and reads as data
 * that failed to load). Admins get the badge; everyone else gets the word in `text-dimmed`.
 * That's cheap enough not to bury the admins: what made a priority column of "= Medium"
 * noise was the colour and the icon on every row, not the letters.
 *
 * **Status** — "not suspended, not awaiting setup" is a genuine absence, so the cell is
 * genuinely empty. An em-dash on seventeen of eighteen rows is a column announcing that
 * nothing is wrong, which is the noise this pass has been removing everywhere else. There
 * is nothing to click here either, so unlike the list view's cells the dash isn't
 * earning its place as a hit target.
 */
const roleBadge = (u: AdminUser) => u.isAdmin
  ? { label: 'Admin', color: 'primary' as const }
  : null

const statusBadge = (u: AdminUser) => {
  if (u.suspendedAt) return { label: 'Suspended', color: 'error' as const }
  if (u.pendingSetup) return { label: 'Pending setup', color: 'warning' as const }
  return null
}

function userMenuItems(u: AdminUser) {
  const items: DropdownMenuItem[][] = []
  const firstGroup: DropdownMenuItem[] = []

  if (u.suspendedAt) {
    firstGroup.push({
      label: 'Unsuspend user',
      icon: 'i-lucide-shield-check',
      onSelect: () => toggleSuspend(u)
    })
  } else {
    // Role toggle
    if (u.isAdmin) {
      firstGroup.push({
        label: 'Demote to user',
        icon: 'i-lucide-user',
        onSelect: () => toggleAdmin(u)
      })
    } else {
      firstGroup.push({
        label: 'Promote to admin',
        icon: 'i-lucide-shield',
        onSelect: () => toggleAdmin(u)
      })
    }
    // Admins create agents regardless; the permission is what a demotion keeps.
    firstGroup.push({
      label: 'Can create agents',
      icon: 'i-lucide-bot',
      type: 'checkbox',
      checked: u.canCreateAgents,
      onSelect: () => toggleCanCreateAgents(u)
    })
    // Resend setup (if pending)
    if (u.pendingSetup) {
      firstGroup.push({
        label: 'Resend setup email',
        icon: 'i-lucide-refresh-cw',
        onSelect: () => resendSetup(u)
      })
    }
  }

  items.push(firstGroup)

  // Destructive group
  const destructive: DropdownMenuItem[] = []
  if (!u.suspendedAt) {
    destructive.push({
      label: 'Suspend user',
      icon: 'i-lucide-shield-ban',
      color: 'error',
      onSelect: () => toggleSuspend(u)
    })
  }
  destructive.push({
    label: 'Delete user',
    icon: 'i-lucide-trash-2',
    color: 'error',
    onSelect: () => openDelete(u)
  })
  items.push(destructive)

  return items
}

// Invitation actions
const invitationLoading = ref<string | null>(null)

async function resendInvitation(inv: PendingInvitation) {
  invitationLoading.value = inv.id
  try {
    await $fetch(`/api/projects/${inv.projectId}/invitations/${inv.id}/resend`, { method: 'POST' })
    toast.add({ title: 'Invitation resent', description: `Sent to ${inv.email}`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to resend invitation', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    invitationLoading.value = null
  }
}

async function cancelInvitation(inv: PendingInvitation) {
  invitationLoading.value = inv.id
  try {
    await $fetch(`/api/projects/${inv.projectId}/invitations/${inv.id}`, { method: 'DELETE' })
    await refreshInvitations()
    toast.add({ title: 'Invitation cancelled', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to cancel invitation', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    invitationLoading.value = null
  }
}

function invitationMenuItems(inv: PendingInvitation): DropdownMenuItem[][] {
  return [[
    {
      label: 'Resend invitation',
      icon: 'i-lucide-refresh-cw',
      onSelect: () => resendInvitation(inv)
    },
    {
      label: 'Cancel invitation',
      icon: 'i-lucide-x',
      color: 'error',
      onSelect: () => cancelInvitation(inv)
    }
  ]]
}

// Create user state
const showCreateModal = ref(false)
const createName = ref('')
const createEmail = ref('')
const createError = ref('')
const creating = ref(false)
const toast = useToast()

function openCreate() {
  createName.value = ''
  createEmail.value = ''
  createError.value = ''
  showCreateModal.value = true
}

async function confirmCreate() {
  creating.value = true
  createError.value = ''
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      body: { name: createName.value, email: createEmail.value }
    })
    showCreateModal.value = false
    await refresh()
    toast.add({ title: 'User created', description: `Setup email sent to ${createEmail.value}`, color: 'success' })
  } catch (e: unknown) {
    createError.value = getErrorMessage(e, 'Failed to create user')
  } finally {
    creating.value = false
  }
}

/** Absolute date for the `title` attribute — the cell itself shows "5mo ago". */
function formatDate(date: string | Date | null) {
  if (!date) return 'Never signed in'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Eighteen near-identical cards do not scan: every account carried an avatar, a bold
 * name, a monospace email, a role pill and a "Last seen" footer in a 3-across grid, so
 * finding the one suspended account meant reading all eighteen. A table puts each fact in
 * the same place on every row and lets the eye run down one column at a time.
 */
const userColumns: TableColumn<AdminUser>[] = [
  { accessorKey: 'name', header: 'Person' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'isAdmin', header: 'Role', meta: { class: { th: 'w-[170px]', td: 'w-[170px]' } } },
  { accessorKey: 'agentCount', header: 'Agents', meta: { class: { th: 'w-[110px]', td: 'w-[110px]' } } },
  { accessorKey: 'suspendedAt', header: 'Status', meta: { class: { th: 'w-[130px]', td: 'w-[130px]' } } },
  { accessorKey: 'lastSeenAt', header: 'Last seen', meta: { class: { th: 'w-[110px]', td: 'w-[110px]' } } },
  { id: 'actions', header: '', meta: { class: { th: 'w-[44px]', td: 'w-[44px]' } } }
]

const invitationColumns: TableColumn<PendingInvitation>[] = [
  { accessorKey: 'email', header: 'Invited' },
  { accessorKey: 'projectName', header: 'Project', meta: { class: { th: 'w-[180px]', td: 'w-[180px]' } } },
  { accessorKey: 'inviterName', header: 'Invited by', meta: { class: { th: 'w-[160px]', td: 'w-[160px]' } } },
  { id: 'actions', header: '', meta: { class: { th: 'w-[44px]', td: 'w-[44px]' } } }
]

/**
 * Padding and header treatment come from `app/utils/table.ts`, which ListView
 * reads too — UTable's own defaults are a step looser than a dense instrument
 * panel wants. The cell *type* is this table's own: `text-sm` because an admin
 * table is a read-only report, where a list view is an editing surface at
 * `text-base`. The comment that used to sit here claimed both matched.
 */
const TABLE_UI = {
  base: 'min-w-full',
  thead: 'bg-muted',
  th: `${TABLE_CELL_PAD} ${TABLE_HEAD_LABEL} text-dimmed whitespace-nowrap`,
  td: `${TABLE_CELL_PAD} text-sm text-default align-middle`,
  tr: 'transition-colors hover:bg-muted/60'
}
</script>

<template>
  <UiPage
    title="Users"
    description="Everyone with an account on this instance"
    width="wide"
  >
    <template #meta>
      <span class="c2s-count">{{ users?.length || 0 }}</span>
    </template>
    <template #actions>
      <UButton
        label="Create user"
        icon="i-lucide-user-plus"
        @click="openCreate"
      />
    </template>

    <!-- Suspended rows keep the error tint; `meta.class.tr` is resolved per row. -->
    <div class="rounded-xl border border-default bg-default overflow-hidden">
      <UTable
        :data="users || []"
        :columns="userColumns"
        :ui="TABLE_UI"
        :meta="{ class: { tr: (row: { original: AdminUser }) => row.original.suspendedAt ? 'bg-error/5 hover:bg-error/10' : '' } }"
        empty="No accounts yet."
      >
        <template #name-cell="{ row }">
          <UiPerson
            :person="row.original"
            size="2xs"
            strong
          />
        </template>

        <template #email-cell="{ row }">
          <span class="font-mono text-xs text-muted truncate block">{{ row.original.email }}</span>
        </template>

        <template #isAdmin-cell="{ row }">
          <UBadge
            v-if="roleBadge(row.original)"
            :color="roleBadge(row.original)!.color"
            :label="roleBadge(row.original)!.label"
          />
          <span
            v-else
            class="inline-flex items-center gap-1.5"
          >
            <span class="text-xs text-dimmed">User</span>
            <!-- The permission, as an outline beside the role. Admins don't
                 carry it: they can create agents anyway. -->
            <UBadge
              v-if="row.original.canCreateAgents"
              color="secondary"
              variant="outline"
              label="Creates agents"
            />
          </span>
        </template>

        <!-- A count, never names, linking to the Agents page filtered to that
             person. Blank for people who cannot have any. -->
        <template #agentCount-cell="{ row }">
          <UTooltip
            v-if="row.original.agentCount"
            :text="`Show ${row.original.name.split(' ')[0]}'s agents`"
          >
            <NuxtLink
              :to="{ path: '/agents', query: { managerId: row.original.id } }"
              class="inline-flex items-center gap-0.5 text-xs tabular-nums text-primary hover:underline underline-offset-2"
            >
              {{ agentCountLabel(row.original.agentCount) }}
              <UIcon
                name="i-lucide-arrow-up-right"
                class="text-xs"
              />
            </NuxtLink>
          </UTooltip>
          <span
            v-else-if="row.original.isAdmin || row.original.canCreateAgents"
            class="text-xs text-dimmed"
          >None</span>
        </template>

        <template #suspendedAt-cell="{ row }">
          <UBadge
            v-if="statusBadge(row.original)"
            :color="statusBadge(row.original)!.color"
            :label="statusBadge(row.original)!.label"
          />
        </template>

        <!-- Relative time is what you scan a "last seen" column for; the exact date is
             one hover away rather than eighteen rows of "Jan 5, 2026". -->
        <template #lastSeenAt-cell="{ row }">
          <span
            class="font-mono tabular-nums text-xs text-dimmed"
            :title="formatDate(row.original.lastSeenAt)"
          >
            {{ row.original.lastSeenAt ? relativeTime(row.original.lastSeenAt) : 'Never' }}
          </span>
        </template>

        <!-- The role pill used to double as the action menu's trigger, so the only way to
             suspend someone was to click the word "User". Actions get their own control. -->
        <template #actions-cell="{ row }">
          <UDropdownMenu
            v-if="row.original.id !== currentUser?.id"
            :items="userMenuItems(row.original)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="actionLoading === row.original.id"
              :aria-label="`Actions for ${row.original.name}`"
            />
          </UDropdownMenu>
        </template>
      </UTable>
    </div>

    <!-- Pending Project Invitations -->
    <template v-if="pendingInvitations?.length">
      <div class="mt-10">
        <UiSectionLabel
          icon="i-lucide-clock"
          label="Pending project invitations"
          :count="pendingInvitations.length"
        />
        <p class="text-sm text-muted mt-1 mb-3">
          These people have been invited to projects but haven't registered yet.
        </p>
        <div class="rounded-xl border border-default bg-default overflow-hidden">
          <UTable
            :data="pendingInvitations"
            :columns="invitationColumns"
            :ui="TABLE_UI"
          >
            <template #email-cell="{ row }">
              <span class="font-mono text-xs text-default truncate block">{{ row.original.email }}</span>
            </template>

            <template #projectName-cell="{ row }">
              <span class="text-muted truncate block">{{ row.original.projectName }}</span>
            </template>

            <template #inviterName-cell="{ row }">
              <span class="text-dimmed truncate block">{{ row.original.inviterName }}</span>
            </template>

            <template #actions-cell="{ row }">
              <UDropdownMenu
                :items="invitationMenuItems(row.original)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="invitationLoading === row.original.id"
                  :aria-label="`Actions for the invitation to ${row.original.email}`"
                />
              </UDropdownMenu>
            </template>
          </UTable>
        </div>
      </div>
    </template>

    <UiModal
      v-model:open="showCreateModal"
      icon="i-lucide-user-plus"
      tone="primary"
      title="Create user"
      description="They get an email to set their own password."
    >
      <template #body>
        <form
          class="flex flex-col gap-3"
          @submit.prevent="confirmCreate"
        >
          <UFormField label="Name">
            <UInput
              v-model="createName"
              placeholder="Full name"
              required
              class="w-full"
            />
          </UFormField>

          <UFormField label="Email">
            <UInput
              v-model="createEmail"
              type="email"
              placeholder="user@example.com"
              required
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="createError"
            color="error"
            variant="subtle"
            icon="i-lucide-alert-circle"
            :description="createError"
          />
        </form>
      </template>

      <template #footer>
        <UiSaveBar
          submit-label="Create user"
          :loading="creating"
          :disabled="!createName.trim() || !createEmail.trim()"
          :shortcut="false"
          @submit="confirmCreate"
          @cancel="showCreateModal = false"
        />
      </template>
    </UiModal>

    <AgentsHandOverDialog
      v-model:open="showHandOver"
      :person="handOver?.person ?? null"
      :action="handOver?.action ?? 'delete'"
      :proceed="handOver?.proceed ?? (async () => {})"
    />

    <UiModal
      v-model:open="showDeleteModal"
      icon="i-lucide-triangle-alert"
      tone="error"
      title="Delete user"
      description="This cannot be undone."
    >
      <template #body>
        <div
          v-if="deleteTarget"
          class="rounded-lg border border-default bg-muted p-3 mb-3"
        >
          <UiPerson
            :person="deleteTarget"
            size="sm"
            strong
          />
          <p class="text-sm font-mono text-muted truncate mt-1">
            {{ deleteTarget.email }}
          </p>
        </div>

        <p class="text-sm text-muted leading-relaxed">
          Removes the account and every project membership it has. Cards assigned to
          them are left unassigned rather than deleted.
        </p>

        <UAlert
          v-if="deleteError"
          class="mt-3"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :description="deleteError"
        />
      </template>

      <template #footer>
        <UiSaveBar
          submit-label="Delete user"
          submit-tone="error"
          :loading="deleting"
          :shortcut="false"
          @submit="confirmDelete"
          @cancel="showDeleteModal = false"
        />
      </template>
    </UiModal>
  </UiPage>
</template>
