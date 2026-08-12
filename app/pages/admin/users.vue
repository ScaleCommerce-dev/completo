<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui/runtime/components/DropdownMenu.vue'

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

function userBadgeLabel(u: AdminUser): string {
  if (u.suspendedAt) return 'Suspended'
  if (u.isAdmin) return 'Admin'
  return 'User'
}

function userBadgeClass(u: AdminUser): string {
  if (u.suspendedAt) return 'bg-error/15 text-error'
  if (u.isAdmin) return 'bg-primary/10 text-primary'
  return 'bg-elevated text-muted'
}

function userBadgeHoverRing(u: AdminUser): string {
  if (u.suspendedAt) return 'hover:ring-red-500/20'
  if (u.isAdmin) return 'hover:ring-primary/20'
  return 'hover:ring-zinc-500/20'
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

function formatDate(date: string | Date | null) {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="u in users"
        :key="u.id"
        class="group rounded-xl border p-4 transition-colors"
        :class="u.suspendedAt
          ? 'border-red-200/60 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10'
          : 'border-default hover:border-primary/60 hover:shadow-md hover:shadow-indigo-500/5'"
      >
        <div class="flex items-start gap-3">
          <UAvatar
            :src="u.avatarUrl ?? undefined"
            :alt="u.name"
            size="md"
            :class="u.suspendedAt ? 'opacity-50' : ''"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3
                class="font-bold text-base tracking-[-0.01em] truncate"
                :class="u.suspendedAt
                  ? 'text-dimmed'
                  : 'text-highlighted'"
              >
                {{ u.name }}
              </h3>
              <UDropdownMenu
                v-if="u.id !== currentUser?.id"
                :items="userMenuItems(u)"
              >
                <button
                  type="button"
                  class="shrink-0 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full cursor-pointer transition hover:ring-2 flex items-center gap-1"
                  :class="[userBadgeClass(u), userBadgeHoverRing(u)]"
                  :disabled="actionLoading === u.id"
                >
                  <UIcon
                    v-if="actionLoading === u.id"
                    name="i-lucide-loader-2"
                    class="text-2xs animate-spin"
                  />
                  <template v-else>
                    {{ userBadgeLabel(u) }}
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="text-2xs opacity-60"
                    />
                  </template>
                </button>
              </UDropdownMenu>
              <span
                v-else
                class="shrink-0 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                :class="userBadgeClass(u)"
              >
                {{ userBadgeLabel(u) }}
              </span>
              <span
                v-if="u.pendingSetup"
                class="shrink-0 text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-warning/10 text-warning"
              >
                Pending Setup
              </span>
            </div>
            <p class="text-sm font-mono text-muted mt-0.5 truncate">
              {{ u.email }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-muted text-xs font-mono text-dimmed">
          <UIcon
            name="i-lucide-eye"
            class="text-xs"
          />
          <span>Last seen {{ formatDate(u.lastSeenAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Pending Project Invitations -->
    <template v-if="pendingInvitations?.length">
      <div class="mt-10">
        <div class="flex items-center gap-2 mb-4">
          <UIcon
            name="i-lucide-clock"
            class="text-lg text-warning"
          />
          <h2 class="text-base font-bold tracking-[-0.01em] text-highlighted">
            Pending Project Invitations
          </h2>
          <span class="text-xs font-mono text-dimmed">{{ pendingInvitations.length }}</span>
        </div>
        <p class="text-sm text-muted mb-4">
          These people have been invited to projects but haven't registered yet.
        </p>
        <div class="rounded-xl border border-amber-200/60 dark:border-amber-800/30 overflow-hidden">
          <div
            v-for="(inv, idx) in pendingInvitations"
            :key="inv.id"
            class="flex items-center gap-3 px-4 py-3 transition-colors"
            :class="[
              idx % 2 === 0 ? 'bg-default' : 'bg-amber-50/30 dark:bg-amber-950/5',
              idx === 0 ? 'rounded-t-xl' : '',
              idx === pendingInvitations.length - 1 ? 'rounded-b-xl' : ''
            ]"
          >
            <UIcon
              name="i-lucide-mail"
              class="text-lg text-amber-400 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-mono text-default">{{ inv.email }}</span>
            </div>
            <span class="text-xs text-muted shrink-0">
              <UIcon
                name="i-lucide-folder"
                class="text-xs inline-block mr-0.5"
              />
              {{ inv.projectName }}
            </span>
            <span class="text-xs text-dimmed shrink-0">
              by {{ inv.inviterName }}
            </span>
            <UDropdownMenu :items="invitationMenuItems(inv)">
              <button
                type="button"
                class="text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer transition hover:ring-2 hover:ring-amber-500/20 flex items-center gap-1 bg-warning/10 text-warning"
                :disabled="invitationLoading === inv.id"
              >
                <UIcon
                  v-if="invitationLoading === inv.id"
                  name="i-lucide-loader-2"
                  class="text-2xs animate-spin"
                />
                <template v-else>
                  Pending
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-2xs opacity-60"
                  />
                </template>
              </button>
            </UDropdownMenu>
          </div>
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
