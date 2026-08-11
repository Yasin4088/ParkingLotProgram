# ParkingLotProgram

微信小程序：停车场装卸排队管理系统（司机预约→GPS签到→排队→管理员叫号→完成）。

## 怎么跑起来

1. 微信开发者工具打开项目根目录
2. 云函数 `cloudfunctions/cloud/` 右键 → 上传并部署：云端安装依赖
3. 首次使用：登录页切管理员 tab → 初始化表单创建超级管理员（一次性）
4. 前端改动自动生效；云函数改动需重新上传部署

## 技术栈

- 前端：微信小程序原生框架 + WeUI
- 后端：微信云开发单云函数（环境 `cloud1-d2go0e8d7d592aa44`）
- 框架：CCMiniCloud Framework 2.0.1（MVC：Controller→Service→Model）
- 数据库：微信云数据库（NoSQL），集合见 context-summary.md
- 认证：bcryptjs 密码哈希 + 随机 token 会话

## 目录约定

```
miniprogram/pages/admin/   # 管理后台页面
miniprogram/pages/login/   # 统一登录页
miniprogram/admin/         # 排队叫号主界面
miniprogram/driver/        # 司机端
miniprogram/biz/           # 业务逻辑（AdminBiz、PassportBiz）
miniprogram/cmpts/         # 公共组件（comm-list、picker、modal）

cloudfunctions/cloud/config/    # 路由（route.js）+ 业务配置
cloudfunctions/cloud/project/
  controller/admin/             # 管理员端控制器
  controller/driver/            # 司机端控制器
  service/admin/                # 业务逻辑
  model/                        # 数据模型
cloudfunctions/cloud/framework/ # CCMiniCloud 框架
```

- 前端页面导航走 PID 映射（`pageHelper.fmtURLByPID`）
- 云函数路由：`config/route.js` → Controller → Service → Model
- 前端调云函数：`cloudHelper.callCloudSumbit('admin/login', data)` 或 `cloudHelper.callCloudData('admin/queue_list', params)`
- `AdminBiz.isAdmin(this)` / `AdminBiz.isSuperAdmin()` 在页面 onLoad 用
- 管理员页面统一 `navigationBarBackgroundColor: "#009F72"`

## 当前状态与下一步

- 分支 `dev-lizirui`，从合作者 Yasin4088 的 master 创建
- **本轮改动**：管理员认证加固（MD5→bcrypt、移除硬编码凭证、频率限制、管理员 CRUD、后台管理页面）
- **下一步**：合并到 master 前与合作者确认，避免覆盖 cloud 环境共享数据
- Practice 版（`D:/practice/zhili-yard-miniapp`）是重构中的多函数版本，共享同一个云环境
