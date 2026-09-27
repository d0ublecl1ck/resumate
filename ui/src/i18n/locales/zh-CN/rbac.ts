export default {
  title: "角色与权限",
  description: "维护 RBAC 角色与权限目录。系统内置项只读，自定义项可增删改。",
  roles: {
    title: "角色",
    hint: "每个角色绑定一组权限；系统角色由代码目录维护，不可修改或删除。",
    create: "新建角色",
    system: "系统内置",
    custom: "自定义",
    count: "{{count}} 项权限",
  },
  permissions: {
    title: "权限目录",
    hint: "权限码与端点绑定，由代码静态声明，因此这里只读；新建/编辑角色时可从这里勾选。",
  },
  fields: {
    code: "编码",
    name: "名称",
    description: "描述",
    permissions: "权限",
  },
  actions: {
    edit: "编辑",
    delete: "删除",
    create: "创建",
    save: "保存",
    cancel: "取消",
    close: "关闭",
  },
  hints: {
    roleCode: "创建后不可修改；只能包含小写字母、数字与下划线。",
  },
  state: {
    saving: "保存中…",
  },
  errors: {
    actionFailed: "操作失败",
  },
}
