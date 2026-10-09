// SCR-114 用户管理：账号列表、封禁/解封与角色调整。
export default {
  title: "用户管理",
  description: "查看全部账号，封禁或解封，并调整账号角色。操作受权限与层级约束。",
  columns: {
    user: "账号",
    email: "邮箱",
    roles: "角色",
    status: "状态",
    createdAt: "创建时间",
    actions: "操作",
  },
  status: {
    active: "正常",
    banned: "已封禁",
  },
  self: "当前登录账号",
  role: {
    label: "角色",
    save: "保存角色",
    saving: "保存中…",
    saved: "角色已更新。",
    none: "无角色",
    noPermission: "当前账号没有分配角色的权限。",
  },
  ban: {
    action: "封禁",
    title: "封禁账号",
    description: "封禁「{{name}}」后，该账号的全部会话会立即失效。",
    reason: "封禁原因",
    reasonPlaceholder: "可选，最多 500 字",
    confirm: "确认封禁",
    banning: "封禁中…",
  },
  unban: {
    action: "解封",
    pending: "解封中…",
  },
  empty: {
    title: "没有账号",
    description: "系统中还没有可管理的账号。",
  },
  loadError: {
    title: "用户列表加载失败",
    description: "请检查网络后重试。",
  },
  forbidden: {
    title: "无权访问用户管理",
    description: "当前账号缺少 user:read 权限。",
  },
  errors: {
    missing: "目标账号已不存在，请刷新后重试。",
    forbidden: "当前操作超出你的权限层级或被权限策略拒绝。",
    validation: "操作参数不合法，请检查后重试。",
    network: "无法连接后端服务，请检查网络后重试。",
    generic: "操作失败，请稍后重试。",
  },
}
