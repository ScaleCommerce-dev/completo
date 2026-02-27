<script setup lang="ts">
definePageMeta({ layout: 'default' })

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

interface DropdownMenuItem {
  label: string
  icon: string
  color?: string
  onSelect: () => void
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
  if (u.suspendedAt) return 'bg-red-100 dark:bg-red-500/10 text-red-500 dark:text-red-400'
  if (u.isAdmin) return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
}

function userBadgeHoverRing(u: AdminUser): string {
  if (u.suspendedAt) return 'hover:ring-red-500/20'
  if (u.isAdmin) return 'hover:ring-indigo-500/20'
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

function invitationMenuItems(inv: PendingInvitation) {
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
  <div class="p-6 max-w-5xl h-full overflow-y-auto">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-xl font-extrabold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
          User Management
        </h1>
        <p class="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Manage all registered users
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NotificationBell />
        <span class="text-[13px] font-mono text-zinc-400 dark:text-zinc-500">{{ users?.length || 0 }} users</span>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all"
          @click="openCreate"
        >
          <UIcon
            name="i-lucide-user-plus"
            class="text-[14px]"
          />
          Create User
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="u in users"
        :key="u.id"
        class="group rounded-xl border p-4 transition-all"
        :class="u.suspendedAt
          ? 'border-red-200/60 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10'
          : 'border-zinc-200/80 dark:border-zinc-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5'"
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
                class="font-bold text-[14.5px] tracking-[-0.01em] truncate"
                :class="u.suspendedAt
                  ? 'text-zinc-400 dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-100'"
              >
                {{ u.name }}
              </h3>
              <UDropdownMenu
                v-if="u.id !== currentUser?.id"
                :items="userMenuItems(u)"
              >
                <button
                  type="button"
                  class="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full cursor-pointer transition-all hover:ring-2 flex items-center gap-1"
                  :class="[userBadgeClass(u), userBadgeHoverRing(u)]"
                  :disabled="actionLoading === u.id"
                >
                  <UIcon
                    v-if="actionLoading === u.id"
                    name="i-lucide-loader-2"
                    class="text-[10px] animate-spin"
                  />
                  <template v-else>
                    {{ userBadgeLabel(u) }}
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="text-[10px] opacity-60"
                    />
                  </template>
                </button>
              </UDropdownMenu>
              <span
                v-else
                class="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                :class="userBadgeClass(u)"
              >
                {{ userBadgeLabel(u) }}
              </span>
              <span
                v-if="u.pendingSetup"
                class="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                Pending Setup
              </span>
            </div>
            <p class="text-[13px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              {{ u.email }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700/40 text-[12px] font-mono text-zinc-400 dark:text-zinc-500">
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
            class="text-lg text-amber-500"
          />
          <h2 class="text-[15px] font-bold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
            Pending Project Invitations
          </h2>
          <span class="text-[12px] font-mono text-zinc-400 dark:text-zinc-500">{{ pendingInvitations.length }}</span>
        </div>
        <p class="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
          These people have been invited to projects but haven't registered yet.
        </p>
        <div class="rounded-xl border border-amber-200/60 dark:border-amber-800/30 overflow-hidden">
          <div
            v-for="(inv, idx) in pendingInvitations"
            :key="inv.id"
            class="flex items-center gap-3 px-4 py-3 transition-colors"
            :class="[
              idx % 2 === 0 ? 'bg-white dark:bg-zinc-800/50' : 'bg-amber-50/30 dark:bg-amber-950/5',
              idx === 0 ? 'rounded-t-xl' : '',
              idx === pendingInvitations.length - 1 ? 'rounded-b-xl' : ''
            ]"
          >
            <UIcon
              name="i-lucide-mail"
              class="text-[16px] text-amber-400 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <span class="text-[13px] font-mono text-zinc-700 dark:text-zinc-300">{{ inv.email }}</span>
            </div>
            <span class="text-[12px] text-zinc-500 dark:text-zinc-400 shrink-0">
              <UIcon
                name="i-lucide-folder"
                class="text-[11px] inline-block mr-0.5"
              />
              {{ inv.projectName }}
            </span>
            <span class="text-[12px] text-zinc-400 dark:text-zinc-500 shrink-0">
              by {{ inv.inviterName }}
            </span>
            <UDropdownMenu :items="invitationMenuItems(inv)">
              <button
                type="button"
                class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer transition-all hover:ring-2 hover:ring-amber-500/20 flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                :disabled="invitationLoading === inv.id"
              >
                <UIcon
                  v-if="invitationLoading === inv.id"
                  name="i-lucide-loader-2"
                  class="text-[10px] animate-spin"
                />
                <template v-else>
                  Pending
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-[10px] opacity-60"
                  />
                </template>
              </button>
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </template>

    <!-- Create User Modal -->
    <UModal v-model:open="showCreateModal">
      <template #content>
        <div class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/30">
                <UIcon
                  name="i-lucide-user-plus"
                  class="text-lg text-indigo-500"
                />
              </div>
              <div>
                <h2 class="text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
                  Create User
                </h2>
                <p class="text-[13px] text-zinc-500 dark:text-zinc-400">
                  They'll receive an email to set their password
                </p>
              </div>
            </div>

            <form
              class="flex flex-col gap-3.5"
              @submit.prevent="confirmCreate"
            >
              <div>
                <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Name
                </label>
                <input
                  v-model="createName"
                  type="text"
                  placeholder="Full name"
                  required
                  class="w-full px-3 py-2 text-[14px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
                >
              </div>

              <div>
                <label class="block text-[12px] font-semibold uppercase tracking-[0.04em] text-zinc-400 dark:text-zinc-500 mb-1.5">
                  Email
                </label>
                <input
                  v-model="createEmail"
                  type="email"
                  placeholder="user@example.com"
                  required
                  class="w-full px-3 py-2 text-[14px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-300 dark:placeholder-zinc-600 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
                >
              </div>

              <!-- Error -->
              <div
                v-if="createError"
                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
              >
                <UIcon
                  name="i-lucide-alert-circle"
                  class="text-[14px] text-red-500 shrink-0"
                />
                <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ createError }}</span>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-700/40 mt-1">
                <button
                  type="button"
                  class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                  @click="showCreateModal = false"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 shadow-sm shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="creating || !createName.trim() || !createEmail.trim()"
                >
                  <UIcon
                    v-if="!creating"
                    name="i-lucide-user-plus"
                    class="text-[14px]"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-loader-2"
                    class="text-[14px] animate-spin"
                  />
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete User Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30">
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="text-lg text-red-500"
                />
              </div>
              <div>
                <h2 class="text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
                  Delete User
                </h2>
                <p class="text-[13px] text-zinc-500 dark:text-zinc-400">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div
              v-if="deleteTarget"
              class="rounded-lg border border-zinc-200 dark:border-zinc-700/60 p-3 bg-zinc-50 dark:bg-zinc-800/50 mb-4"
            >
              <div class="flex items-center gap-3">
                <UAvatar
                  :src="deleteTarget.avatarUrl ?? undefined"
                  :alt="deleteTarget.name"
                  size="sm"
                />
                <div class="min-w-0">
                  <p class="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {{ deleteTarget.name }}
                  </p>
                  <p class="text-[13px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                    {{ deleteTarget.email }}
                  </p>
                </div>
              </div>
            </div>

            <p class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              This will remove the user and all their project memberships. Cards assigned to this user will be unassigned.
            </p>
          </div>

          <!-- Error -->
          <div
            v-if="deleteError"
            class="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
          >
            <UIcon
              name="i-lucide-alert-circle"
              class="text-[14px] text-red-500 shrink-0"
            />
            <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ deleteError }}</span>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40 mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="showDeleteModal = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-sm shadow-red-500/20 hover:shadow-md hover:shadow-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="deleting"
              @click="confirmDelete"
            >
              <UIcon
                v-if="!deleting"
                name="i-lucide-trash-2"
                class="text-[14px]"
              />
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="text-[14px] animate-spin"
              />
              Delete User
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
