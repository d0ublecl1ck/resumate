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
    empty: "No custom roles yet.",
  },
  permissions: {
    title: "Permissions",
    hint: "Endpoint permission codes are declared in code; custom permissions only extend the role catalogue.",
    create: "New permission",
    system: "Built-in",
    custom: "Custom",
    empty: "No custom permissions yet.",
  },
  fields: {
    code: "Code",
    name: "Name",
    description: "Description",
    group: "Group",
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
    permissionCode: "Immutable after creation; shaped like resource:action.",
  },
  state: {
    saving: "Saving…",
  },
  errors: {
    actionFailed: "Action failed",
  },
}
