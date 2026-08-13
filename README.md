# ParkingLotProgram — 停车场装卸排队管理系统

微信小程序：管理员建任务 → 司机按车牌认领 → GPS签到排队 → 管理员叫号 → 叉车抢单 → 双凭证完成 → 现场费用+结算 → 司机支付 → 月末报表。三个角色：货车司机、叉车司机、管理员。

## 技术栈

- **前端**：微信小程序原生框架 + WeUI
- **后端**：微信云开发（单个云函数 `cloud`）
- **框架**：CCMiniCloud Framework 2.0.1（MVC：Controller → Service → Model）
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
- **任务制全流程**：管理员建任务（车牌+备注+预估费用）→ 司机按车牌认领+GPS签到 → 叫号 → 叉车抢单（无人抢可手动派单）→ 司机确认与叉车接单并行 → 执行中双凭证完成 → 费用编辑+结算 → 待支付/免支付完成
- **状态机**：待认领(0)→已预约(1)→排队中(2)→已叫号(3)→执行中(4)→待结算(5)→待支付(6)→已完成(9)/已取消(10)
- **费用**：固定项 办单费/过磅费/拆箱费/吊机费/存柜费 + 可自定义；司机支付前管理员可随时修改
- **备注栏**：管理员录入客户文本信息，管理员与叉车司机可见
- **看板实时化**：10 秒自动刷新、状态统计筛选、每单用时
- **历史月报**：按月筛选 + 导出经营报表（含备注列）
- 唯一堆场：装卸堆场（无需选停车场）
- 微信支付 Skill 已安装到 `.claude/skills/`，支付接入尚未开始
