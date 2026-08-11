---
name: admin queue features
overview: 为管理员队列增加过期预约清理、队列成员详情、编辑和取消能力；微信通知先接入可配置发送入口，模板 ID 后续补齐后启用。
todos:
  - id: backend-expire-cancel
    content: 实现后端过期未签到预约清理和软取消字段
    status: completed
  - id: backend-admin-routes
    content: 新增管理员队列详情、编辑、取消接口与路由
    status: completed
  - id: backend-notice-hook
    content: 新增取消微信通知配置和模板发送入口
    status: completed
  - id: frontend-detail-edit
    content: 在管理员队列页增加成员详情、编辑和取消交互
    status: completed
  - id: verify-flow
    content: 检查 lints，并验证刷新清理、编辑、取消后列表更新流程
    status: completed
isProject: false
---

# 管理员队列功能增强计划

## 实现范围
- 后端以 `QUEUE_STATUS = CANCEL` 做“删除/取消”，不物理删除数据库记录；当前队列列表已只展示 `BOOKED / WAITING / CALLED`，所以取消后会立即从队列移除，并允许司机重新预约。
- “超过一天未签到”只处理仍处于 `BOOKED` 的预约：在管理员打开或刷新队列时，由 `admin/queue_list` 触发清理，超过 24 小时的记录自动改为 `CANCEL`。
- 管理员点击队列成员后，在当前页面展示预约详情，并提供编辑、取消按钮；编辑保存后刷新列表。
- 微信订阅消息模板暂未配置：新增取消通知模板配置项和后端发送入口，模板 ID 为空时不发送，但会保存取消原因。后续在微信公众平台配置模板并填入 ID 后即可启用。

## 主要改动文件
- [`cloudfunctions/cloud/project/model/queue_model.js`](cloudfunctions/cloud/project/model/queue_model.js)
  - 增加取消原因、取消时间等字段，例如 `QUEUE_CANCEL_REASON`、`QUEUE_CANCEL_TIME`。
- [`cloudfunctions/cloud/project/service/queue_service.js`](cloudfunctions/cloud/project/service/queue_service.js)
  - 增加 `cancelExpiredBookings()`：管理员列表加载前清理超过 24 小时未签到的 `BOOKED` 记录。
  - 增加 `detail(id)`、`edit(id, data)`、`cancel(id, reason, operator)`。
  - 编辑时校验停车场与业务类型，更新 `QUEUE_LOT_NAME / QUEUE_ACTION_NAME` 等派生字段。
  - 取消时保存原因并尝试发送微信订阅消息；模板 ID 为空时跳过发送。
- [`cloudfunctions/cloud/project/controller/admin/admin_queue_controller.js`](cloudfunctions/cloud/project/controller/admin/admin_queue_controller.js)
  - 新增 `detail`、`edit`、`cancel` 控制器方法，并复用管理员鉴权。
- [`cloudfunctions/cloud/config/route.js`](cloudfunctions/cloud/config/route.js)
  - 新增 `admin/queue_detail`、`admin/queue_edit`、`admin/queue_cancel` 路由。
- [`cloudfunctions/cloud/config.json`](cloudfunctions/cloud/config.json)
  - 增加 `subscribeMessage.send` 权限，供后续模板 ID 配置后发送微信订阅消息。
- [`miniprogram/setting/setting.js`](miniprogram/setting/setting.js)
  - 新增 `QUEUE_CANCEL_TEMPLATE_ID: ''` 配置项。
- [`miniprogram/admin/queue.js`](miniprogram/admin/queue.js)
  - 增加点击成员查看详情、编辑保存、取消原因输入、刷新列表等逻辑。
- [`miniprogram/admin/queue.wxml`](miniprogram/admin/queue.wxml)
  - 队列卡片绑定点击事件，新增详情/编辑弹层或操作区。
- [`miniprogram/admin/queue.wxss`](miniprogram/admin/queue.wxss)
  - 增加详情弹层、编辑表单、操作按钮样式。

## 交互设计
- 点击队列卡片：弹出/展示该车辆预约详情，包括车牌、手机号、停车场、装卸类型、预约时间、签到时间、叫号时间、状态、凭证图片等。
- 编辑：允许管理员修改车牌、手机号、停车场、装卸类型；已完成或已取消记录不允许编辑。
- 取消/删除：要求填写原因；提交后状态变为“已取消”，从当前队列移除，并提示司机需要重新预约。
- 自动过期：管理员进入页面或点击“刷新列表”时自动清理过期未签到记录，再返回最新队列。

## 微信通知策略
- 取消时优先通过 `QUEUE_OPENID` 发送订阅消息，内容包含车牌、取消原因、重新预约提示。
- 由于目前没有模板 ID，发送逻辑会检测配置为空并直接跳过，避免报错影响管理员操作。
- 后续需要在微信公众平台配置取消通知模板，并把模板 ID 填入配置；司机端订阅授权也需在模板 ID 配置后启用。