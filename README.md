# ParkingLotProgram — 停车场装卸排队管理系统

微信小程序：司机预约装卸货 → GPS签到 → 排队 → 管理员叫号 → 完成装卸。

## 技术栈

- **前端**：微信小程序原生框架 + WeUI
- **后端**：微信云开发（单个云函数 `cloud`）
- **框架**：自研 CCMiniCloud Framework 2.0.1（MVC：Controller → Service → Model）
- **数据库**：微信云数据库（NoSQL）
- **认证**：bcrypt 密码哈希 + 随机 token 会话

## 目录结构

```
miniprogram/        # 小程序前端
  pages/login/      # 统一登录页（司机 + 管理员）
  pages/admin/      # 管理后台（司机管理、管理员管理、日志等）
  admin/            # 排队叫号主界面
  driver/           # 司机端
  biz/              # 业务逻辑（AdminBiz、PassportBiz）
  helper/           # 工具（cloud_helper、cache_helper、page_helper）
  cmpts/            # 公共组件（comm-list、picker、modal）

cloudfunctions/cloud/   # 云函数（单体）
  config/            # 路由、业务配置
  project/
    controller/      # 控制器（admin/、driver/）
    service/         # 业务逻辑
    model/           # 数据模型（ax_admin、ax_user、ax_queue 等）
  framework/         # CCMiniCloud 框架核心
```

## 怎么跑

1. 微信开发者工具打开项目根目录
2. 云函数部署：右键 `cloudfunctions/cloud/` → 上传并部署：云端安装依赖
3. 首次使用：登录页切到管理员 tab → 初始化表单创建超级管理员
4. 前端改动自动生效；云函数改动需重新部署

## 当前状态

- 分支：`dev-lizirui`
- 管理员认证已加固（bcrypt、频率限制、管理员 CRUD）
- 排队叫号核心流程可用
- 司机端支持微信一键登录 + 注册 + 个人信息编辑
