// 登录、注册与会话校验文案。
export default {
  login: {
    title: "登录 Resumate",
    subtitle: "用邮箱和密码继续你的求职准备。",
  },
  register: {
    title: "创建账号",
    subtitle: "用邮箱注册，开始整理你的职业事实库。",
  },
  fields: {
    displayName: "昵称",
    email: "邮箱",
    password: "密码",
    passwordHint: "至少 8 位字符。",
  },
  actions: {
    login: "登录",
    register: "注册并登录",
    submitting: "处理中…",
    switchToRegister: "去注册",
    switchToLogin: "去登录",
    haveAccount: "已经有账号？",
    noAccount: "还没有账号？",
  },
  errors: {
    invalidCredentials: "邮箱或密码不正确。",
    accountBanned: "账号已被封禁，请联系管理员。",
    emailRegistered: "该邮箱已注册，直接登录即可。",
    network: "无法连接后端服务，请确认服务已启动。",
    generic: "操作失败，请稍后重试。",
  },
  sessionChecking: "正在校验登录状态…",
}
