# ParkingLotProgram 项目上下文要点

## 项目概况

微信小程序停车场装卸排队管理系统。司机预约装卸货→GPS签到→排队→管理员叫号→完成。

## 两套代码

| 位置 | 用途 | 架构 |
|------|------|------|
| `d:/github/ParkingLotProgram` | GitHub 仓库，已关联 `Yasin4088/ParkingLotProgram.git` | 单体云函数（cloudfunctions/cloud/） |
| `D:/practice/zhili-yard-miniapp` | 微信开发者工具实际打开的项目 | 多函数架构（login/checkIn/getQueue/callDriver/createReservation） |

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
- Practice 版 `miniprogram/app.js` 中 env 还是占位符 `'你的云环境ID'`（但能跑，因为云函数用了 `DYNAMIC_CURRENT_ENV`）

## 管理员认证（2026-08-11 改）

- 密码使用 **bcrypt** 哈希（已从 MD5 升级）
- 硬编码凭证已从 config.js 移除
- 首次部署通过登录页初始化表单创建超级管理员（一次性 `/admin/setup` 端点）
- 登录 5 次失败锁定 15 分钟
- 已清理 MASK_* 认证后门死代码
- 管理员管理 CRUD 界面：`后台管理 → 管理员管理`（仅超管可见）

## 管理员新增机制

1. 首次部署 → 登录页切管理员 tab → 自动检测需要初始化 → 填 Yasin/4088 → 创建超管
2. 后续新增 → 超管登录 → 后台管理 → 管理员管理 → 添加管理员

## 云函数调试

- 微信开发者工具中右键云函数目录 → "上传并部署：云端安装依赖"
- 前端代码改动自动刷新，云函数代码改动需重新上传部署
- 开发者工具 Console 面板可查看前端日志
- 云开发控制台 → 云函数 → 日志 可查看云端日志

## 登录流程

1. 前端 `pages/login/login.js` 调用 `cloudHelper.callCloudSumbit('admin/login', ...)` 或 `'driver/wxLogin'`
2. 云函数根据 `route.js` 路由到对应 Controller
3. Controller 校验参数 → Service 处理业务逻辑 → Model 操作数据库
4. 返回结果 → 前端跳转

## 核心功能模块

- 排队预约（create）→ GPS签到（checkin）→ 管理员叫号（callNext）→ 完成（finish）
- 停车场: A/一号停车场、B/二号停车场、C/三号停车场
- 业务类型: load/装货、unload/卸货
- 司机上传单证图片（前端调用微信 imgSecCheck 审核色情/政治/暴恐）

## 数据库集合

ax_admin, ax_user, ax_queue, ax_meet, ax_news, ax_setup, ax_log, ax_day, ax_export, ax_join, ax_cache, ax_temp

## 关于合作者

- 合作者 Yasin4088 是 GitHub 仓库 owner
- 共用同一个云环境，云函数和数据库是共享的
- 上传云函数或改数据库前需要沟通
