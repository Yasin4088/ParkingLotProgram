# ParkingLotProgram 项目上下文要点

## 项目概况

微信小程序停车场装卸排队管理系统。三角色：货车司机（预约+签到）→ 管理员（叫号+派叉车）→ 叉车司机（执行+完成）。

## 两套代码

| 位置 | 用途 | 架构 |
|------|------|------|
| `d:/github/ParkingLotProgram` | GitHub 仓库，已关联 `Yasin4088/ParkingLotProgram.git` | 单体云函数（cloudfunctions/cloud/） |
| `D:/practice/zhili-yard-miniapp` | 微信开发者工具实际打开的项目 | 多函数架构 |

- GitHub版用自研 CCMiniCloud Framework 2.0.1（MVC），路由 `config/route.js`
- Practice版是重构后的新版本，云函数各自独立
- 两个版本**共享同一个云环境** `cloud1-d2go0e8d7d592aa44`

## Git 状态

- GitHub 仓库当前在 `dev-lizirui` 分支（从 master 创建）
- master 是合作者的主分支
- 推送到 `dev-lizirui` 不影响 master

## 云环境

- 环境ID: `cloud1-d2go0e8d7d592aa44`
- AppID: `wx3decd5e9b69b1b7e`

## 认证机制

| 角色 | 密码方案 | Token 缓存 Key | 导航栏颜色 |
|------|----------|---------------|-----------|
| 货车司机 | MD5（历史兼容） | CACHE_TOKEN | 默认 |
| 叉车司机 | bcrypt | CACHE_FORKLIFT | #E67E22（橙色） |
| 管理员 | bcrypt + 频率限制 | CACHE_ADMIN | #009F72（绿色） |

- 首次部署通过登录页初始化表单创建超级管理员（`/admin/setup`）
- 登录 5 次失败锁定 15 分钟

## 核心工作流

1. 司机预约（选装货/卸货、填车牌/手机/货物名、上传单证）→ 状态：已预约(0)
2. 到现场 GPS 签到 → 状态：排队中(1)，获得排队号
3. 管理员任选一辆排队中车辆叫号 + 指派叉车司机 → 状态：已叫号(2)
4. 司机收到通知后点"确认收到" → 状态：司机已确认(3)
5. 叉车司机完成任务 → 状态：已完成(9)
6. 超时自动取消：已预约 24h 未签到 / 已叫号 5min 未确认 → 已取消(10)

## 场地

- **唯一堆场**：装卸堆场（ID=A，地址=园区装卸区）
- 所有端（司机/叉车/管理员）均无需停车场选择

## 登录流程

1. 前端 `pages/login/login.js` → 三 Tab：司机（微信一键）/叉车（用户名密码）/管理员（用户名密码）
2. `cloudHelper` 根据 route 前缀自动注入对应 token（admin/→CACHE_ADMIN, forklift/→CACHE_FORKLIFT, 其他→CACHE_TOKEN）
3. 云函数按 `route.js` → Controller → Service → Model 处理

## 数据库集合

ax_admin, ax_user, ax_queue, ax_meet, ax_news, ax_setup, ax_log, ax_day, ax_export, ax_join, ax_cache, ax_temp

- `ax_user`：所有用户共表，`USER_ROLE` 区分（driver/forklift），管理员独立 `ax_admin` 表
- `ax_queue`：排队记录，新增字段 QUEUE_FORKLIFT_ID/NAME/TIME, QUEUE_CONFIRM_TIME

## 关于合作者

- 合作者 Yasin4088 是 GitHub 仓库 owner
- 共用同一个云环境，云函数和数据库是共享的
- 上传云函数或改数据库前需要沟通
