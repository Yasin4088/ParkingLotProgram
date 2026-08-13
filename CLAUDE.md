# ParkingLotProgram

微信小程序停车场装卸排队管理系统：管理员建任务 → 司机按车牌认领 → GPS 签到排队 → 管理员叫号 → 叉车抢单 → 双凭证完成 → 现场费用+结算 → 司机支付 → 月末报表。

## 怎么跑

- 微信开发者工具打开项目根目录（无本地构建步骤）
- 云函数：右键 `cloudfunctions/cloud/` → 上传并部署：云端安装依赖；**改完云函数代码必须重新部署**
- 首次使用：登录页切到管理员 tab → 初始化表单创建超级管理员
- 改前端（miniprogram/）在开发者工具里自动生效；改云函数（cloudfunctions/cloud/）需重新部署

## 技术栈

- 前端：微信小程序原生框架 + WeUI；后端：微信云开发（单云函数 `cloud`）+ 微信云数据库
- 框架：CCMiniCloud 2.0.1（MVC：route.js → Controller → Service → Model）
- 认证：司机微信登录；叉车/管理员账号密码（bcrypt）；统一登录页三 Tab

## 目录与约定

```
miniprogram/          # 前端
  admin/queue.*       # 管理员叫号看板（状态筛选、10s自动刷新、叫号/派单/费用/结算）
  pages/admin/        # 后台（首页实时统计、司机/叉车/用户管理、历史月报导出）
  pages/forklift/     # 叉车司机任务页（抢单/倒计时/双凭证完成）
  driver/             # 司机端（车牌认领/GPS签到/确认/支付）
  helper/             # cloud_helper、cache_helper 等
cloudfunctions/cloud/ # 云函数（单体）：config/route.js + project/{controller,service,model}
.claude/skills/       # 已安装微信支付 Skill（gitignored，接入支付时使用）
```

- 队列状态机：CLAIM_PENDING(0)→BOOKED(1)→WAITING(2)→CALLED(3)→EXECUTING(4)→FINISHED(5)→TO_PAY(6)→DONE(9)/CANCEL(10)；叉车接单方式 0=抢单,1=管理员派单
- 费用：固定项 办单费/过磅费/拆箱费/吊机费/存柜费 + 可自定义；≤3 状态经编辑表单保存（预估），4/5/6 经费用弹窗整体保存（现场，支付前可改）；金额单位分，前端展示换算元
- 任务备注 QUEUE_REMARK：管理员录入/编辑，管理员+叉车司机可见，月报导出含备注列
- 新路由在 `config/route.js` 注册；业务校验在 Service，Controller 只做参数校验与鉴权
- 文案用中文，UI 用 rpx，缩进用 tab

## 上线前清单（用户准备发布时，AI 必须主动逐项提醒）

- **用户隐私保护指引**（GPS 签到依赖）：小程序后台 mp.weixin.qq.com → 设置 → 服务内容声明 → 用户隐私保护指引，声明「位置信息」及用途；未配置时真机上 wx.getLocation 会报隐私协议错误（开发者工具模拟器不受影响）
- 微信支付接入完成后补充：商户号绑定、支付场景声明等（阶段 5 时追加）

## 当前状态与下一步

- 当前（分支 dev-lizirui）：任务制重构 + 看板实时化 + 备注/固定费用已部署；手机号授权（cloudID+getOpenData）与 GPS 签到（requiredPrivateInfos 声明）已修复；端到端测试进行中
- 下一步：① 完成端到端验证；② 接入微信支付（Skill 已装，用「我要接入基础支付」开场）；候选场景：装卸服务费收款
- 遗留：`projects/A00/` 模板页仍注册未清理；`behavior/`、`tpls/` 模板死引用待清
- 注意：本机直连 GitHub 不稳定（2026-08 验证），克隆外部仓库用 ghfast.top 镜像；本机 Python 不可用（Microsoft Store 空壳），微信支付 Skill 的知识库同步需手动 curl 下载 wx.gtimg.com 上的 zip
