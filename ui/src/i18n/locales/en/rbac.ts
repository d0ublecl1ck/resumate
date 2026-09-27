export default {
  title: "Roles & permissions",
  description: "Maintain the RBAC role and permission catalogue. Built-in entries are read-only; custom ones can be created, edited and deleted.",
  roles: {
    title: "Roles",
    hint: "Each role binds a set of permissions; built-in roles come from the code catalogue and cannot be edited or deleted.",
    create: "New role",
    system: "Built-in",
    custom: "Custom",
    count: "{{count}} permissions",
  },
  permissions: {
    title: "Permission catalogue",
    hint: "Permission codes are bound to endpoints and declared in code, so this list is read-only. Pick from it when creating or editing a role.",
  },
  fields: {
    code: "Code",
    name: "Name",
    description: "Description",
    permissions: "Permissions",
  },
  actions: {
    edit: "Edit",
    delete: "Delete",
    create: "Create",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
  },
  hints: {
    roleCode: "Immutable after creation; lowercase letters, digits and underscores only.",
  },
  state: {
    saving: "Saving…",
  },
  errors: {
    actionFailed: "Action failed",
  },
}
