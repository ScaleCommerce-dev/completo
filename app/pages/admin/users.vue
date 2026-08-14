<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'
import type { TableColumn } from '@nuxt/ui/runtime/components/Table.vue'

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
  deleteTarget.value = user
  deleteError.value = ''
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/user/${deleteTarget.value.id}`, { method: 'DELETE' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (e: unknown) {
    deleteError.value = getErrorMessage(e, 'Failed to delete user')
  } finally {
    deleting.value = false
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

async function toggleSuspend(u: AdminUser) {
  actionLoading.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { suspended: !u.suspendedAt }
    })
    await refresh()
    toast.add({ title: u.suspendedAt ? `${u.name} unsuspended` : `${u.name} suspended`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to update user', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    actionLoading.value = null
  }
}

async function toggleAdmin(u: AdminUser) {
  actionLoading.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { isAdmin: !u.isAdmin }
    })
    await refresh()
    toast.add({ title: `${u.name} is now ${u.isAdmin ? 'a regular user' : 'an admin'}`, color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Failed to update user', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
  } finally {
    actionLoading.value = null
  }
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
  { accessorKey: 'isAdmin', header: 'Role', meta: { class: { th: 'w-[92px]', td: 'w-[92px]' } } },
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
 * One table vocabulary in the app: these are ListView's header and cell metrics, so the
 * admin tables and the project list views describe a row the same way. UTable's own
 * defaults are a step looser (`px-4 py-3.5`, sentence-case `text-sm` headers) than a
 * dense instrument panel wants.
 */
const TABLE_UI = {
  base: 'min-w-full',
  thead: 'bg-muted',
  th: 'px-3 py-2 text-xs font-bold uppercase tracking-label text-dimmed whitespace-nowrap',
  td: 'px-3 py-2 text-sm text-default align-middle',
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
      <span class="text-sm font-mono tabular-nums text-dimmed">{{ users?.length || 0 }}</span>
    </template>
    <template #actions>
      <UButton
        label="Create user"
        icon="i-lucide-user-plus"
        @click="openCreate"
      />
    </template>

    <!-- Suspended rows keep the error tint; `meta.class.tr` is resolved per row. -->
    <div class="rounded-xl border border-default overflow-hidden">
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
            class="text-xs text-dimmed"
          >User</span>
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
        <div class="rounded-xl border border-default overflow-hidden">
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
      size="sm"
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

    <UiModal
      v-model:open="showDeleteModal"
      icon="i-lucide-triangle-alert"
      tone="error"
      title="Delete user"
      description="This cannot be undone."
      size="sm"
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
