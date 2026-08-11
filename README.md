# ParkingLotProgram — 停车场装卸排队管理系统

微信小程序：司机预约装卸货 → GPS签到 → 排队 → 管理员叫号+派叉车 → 司机确认 → 叉车执行 → 完成。三个角色：货车司机、叉车司机、管理员。

## 技术栈

- **前端**：微信小程序原生框架 + WeUI
- **后端**：微信云开发（单个云函数 `cloud`）
- **框架**：自研 CCMiniCloud Framework 2.0.1（MVC：Controller → Service → Model）
- **数据库**：微信云数据库（NoSQL）
- **认证**：bcrypt 密码哈希 + 随机 token 会话

## 目录结构

```
miniprogram/        # 小程序前端
  pages/login/      # 统一登录页（司机/叉车司机/管理员 三Tab）
  pages/admin/      # 管理后台（司机管理、叉车管理、管理员管理、日志等）
  pages/forklift/   # 叉车司机任务页
  admin/            # 排队叫号主界面
  driver/           # 司机端
  biz/              # 业务逻辑（AdminBiz、ForkliftBiz、PassportBiz）
  helper/           # 工具（cloud_helper、cache_helper、page_helper）
  cmpts/            # 公共组件（comm-list、picker、modal）

cloudfunctions/cloud/   # 云函数（单体）
  config/            # 路由、业务配置
  project/
    controller/      # 控制器（admin/、driver/、forklift）
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
- **三个角色**：货车司机（微信登录）、叉车司机（账号密码登录）、管理员
- 管理员认证已加固（bcrypt、频率限制、管理员 CRUD）
- 排队叫号完整工作流可用（预约→签到→叫号+派叉车→司机确认→叉车执行→完成）
- 唯一堆场：装卸堆场（无需选停车场）
