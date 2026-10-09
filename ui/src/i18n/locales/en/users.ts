// SCR-114 User management: account list, ban/unban and role assignment.
export default {
  title: "User management",
  description: "View every account, ban or unban it, and adjust its role. Actions are constrained by permissions and rank.",
  columns: {
    user: "Account",
    email: "Email",
    roles: "Roles",
    status: "Status",
    createdAt: "Created",
    actions: "Actions",
  },
  status: {
    active: "Active",
    banned: "Banned",
  },
  self: "Current account",
  role: {
    label: "Role",
    save: "Save role",
    saving: "Saving…",
    saved: "Role updated.",
    none: "No role",
    noPermission: "Your account cannot assign roles.",
  },
  ban: {
    action: "Ban",
    title: "Ban account",
    description: "Banning “{{name}}” immediately invalidates all of its sessions.",
    reason: "Ban reason",
    reasonPlaceholder: "Optional, up to 500 characters",
    confirm: "Confirm ban",
    banning: "Banning…",
  },
  unban: {
    action: "Unban",
    pending: "Unbanning…",
  },
  empty: {
    title: "No accounts",
    description: "There are no manageable accounts yet.",
  },
  loadError: {
    title: "Could not load the user list",
    description: "Check your connection and try again.",
  },
  forbidden: {
    title: "No access to user management",
    description: "Your account lacks the user:read permission.",
  },
  errors: {
    missing: "The target account no longer exists. Refresh and try again.",
    forbidden: "This action exceeds your permission rank or was rejected by policy.",
    validation: "The action parameters are invalid. Check them and try again.",
    network: "Cannot reach the backend service. Check your connection and try again.",
    generic: "The action failed. Please try again later.",
  },
}
