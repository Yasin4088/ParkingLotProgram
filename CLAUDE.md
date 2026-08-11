# ParkingLotProgram

微信小程序：停车场装卸排队管理系统（司机预约→GPS签到→排队→管理员叫号+派叉车→司机确认→叉车执行→完成）。

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
miniprogram/pages/login/   # 统一登录页（司机/叉车/管理员三Tab）
miniprogram/pages/forklift/ # 叉车司机任务页
miniprogram/admin/         # 排队叫号主界面
miniprogram/driver/        # 司机端
miniprogram/biz/           # 业务逻辑（AdminBiz、ForkliftBiz、PassportBiz）
miniprogram/cmpts/         # 公共组件（comm-list、picker、modal）

cloudfunctions/cloud/config/    # 路由（route.js）+ 业务配置
cloudfunctions/cloud/project/
  controller/admin/             # 管理员端控制器
  controller/driver/            # 司机端控制器
  controller/forklift_controller.js  # 叉车司机控制器
  service/admin/                # 管理员业务逻辑
  service/forklift_service.js   # 叉车司机业务逻辑
  model/                        # 数据模型
cloudfunctions/cloud/framework/ # CCMiniCloud 框架
```

- 前端页面导航走 PID 映射（`pageHelper.fmtURLByPID`）
- 云函数路由：`config/route.js` → Controller → Service → Model
- 前端调云函数：`cloudHelper.callCloudSumbit('admin/login', data)` 或 `cloudHelper.callCloudData('admin/queue_list', params)`
- `AdminBiz.isAdmin(this)` / `ForkliftBiz.isForklift(that)` 在页面 onLoad 用
- 管理员页面 `navigationBarBackgroundColor: "#009F72"`，叉车司机页面 `#E67E22`

## 当前状态与下一步

- 分支 `dev-lizirui`，从合作者 Yasin4088 的 master 创建
- **本轮改动**：新增叉车司机角色 + 叫号流程改造（灵活叫号+叉车指派+司机确认+任务执行）、管理员认证加固（MD5→bcrypt、频率限制、管理员 CRUD）
- **排队状态机**：已预约(0)→排队中(1)→已叫号(2)→司机已确认(3)→已完成(9)/已取消(10)
- **唯一堆场**：装卸堆场（ID=A），所有端无需停车场选择
- **下一步**：合并到 master 前与合作者确认，避免覆盖 cloud 环境共享数据
- Practice 版（`D:/practice/zhili-yard-miniapp`）是重构中的多函数版本，共享同一个云环境
