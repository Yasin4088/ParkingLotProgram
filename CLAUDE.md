# ParkingLotProgram

微信小程序停车场装卸排队管理系统：管理员建任务 → 司机按车牌认领 → GPS 签到排队 → 管理员叫号 → 叉车抢单 → 单据照片完成 → 现场费用+结算 → 司机支付 → 月末报表。

## 怎么跑

- 微信开发者工具打开项目根目录（无本地构建步骤）
- 云函数：右键 `cloudfunctions/cloud/` → 上传并部署：云端安装依赖；**改完云函数代码必须重新部署**
- 首次使用：登录页切到管理员 tab → 初始化表单创建超级管理员
- 改前端（miniprogram/）在开发者工具里自动生效；改云函数（cloudfunctions/cloud/）需重新部署

## 技术栈

- 前端：微信小程序原生框架 + WeUI；后端：微信云开发（单云函数 `cloud`）+ 微信云数据库
- 框架：CCMiniCloud 2.0.1（MVC：route.js → Controller → Service → Model）
- 认证：司机微信登录；叉车/吊柜/管理员账号密码（bcrypt）；统一登录页三 Tab；司机登录后先到业务选择页（装卸货/存柜/取柜）再分流

## 目录与约定

```
miniprogram/          # 前端
  admin/queue.*       # 管理员叫号看板（状态筛选、10s自动刷新、叫号/派单/费用/结算）
  admin/storage.*     # 管理员存取柜看板（独立排队/叫号/派单/确认收款/柜型管理）
  pages/admin/        # 后台（首页实时统计、司机/叉车/用户管理、历史月报导出、存取柜历史）
  pages/forklift/     # 叉车司机任务页（抢单/倒计时/单据照片完成）
  pages/storage_forklift/ # 吊柜工作台（存取柜执行：存柜/取柜、单据照片完成）
  driver/             # 司机端（biz_select 业务选择页；home 装卸货：车牌认领/GPS签到/确认/支付；storage 存取柜登记；storage_my 我的存柜）
  helper/             # cloud_helper、cache_helper 等
cloudfunctions/cloud/ # 云函数（单体）：config/route.js + project/{controller,service,model,lib}
cloudfunctions/payNotify/ # 微信支付回调云函数（HTTP触发+定时查单，独立部署；certs/ 放平台证书）
.claude/skills/       # 已安装微信支付 Skill（gitignored，接入支付时使用）
```

- 队列状态机：CLAIM_PENDING(0)→BOOKED(1)→WAITING(2)→CALLED(3)→EXECUTING(4)→FINISHED(5)→TO_PAY(6)→DONE(9)/CANCEL(10)；叉车接单方式 0=抢单,1=管理员派单
- 工作身份：USER_ROLE 值 driver=司机,admin=管理员,forklift=叉车司机,crane=吊柜司机；叉车/吊柜登录后按角色直达各自工作台（叉车=装卸货，吊柜=存取柜），后端 base_controller.checkWorkRole 强制互斥（两工作台 API 互调报「账号无操作权限」）；管理员端叉车/吊柜列表合并管理、编辑页可设身份
- 存取柜状态机：0待叫号·存柜→1已叫号·存柜→2存柜执行中→3已存柜→4取柜待缴费→5取柜待叫号→6已叫号·取柜→7取柜执行中→8已取柜/9已取消（管理员可取消看板任意状态）；计费起点=存柜完成时间（吊柜拍照确认），按天计费不足1天按1天（天数×柜型日单价，费用在取柜登记时服务端重算锁定）；存柜码6位数字为取柜凭证；存柜登记与取柜缴费确认各生成一次排队号（当天全局序号，payNotify 内同算法副本需同步修改）
- 费用：固定项 办单费/过磅费/拆箱费/吊机费/存柜费 + 可自定义；≤3 状态经编辑表单保存（预估），4/5/6 经费用弹窗整体保存（现场，支付前可改）；金额单位分，前端展示换算元；预估费用金额为 0/留空不计入，现场费用仍要求 >0
- 支付：PAY_STATUS 0=未支付,1=已支付,2=免支付,3=记账；PAY_MODE 0=现场支付,1=客户记账（建单/编辑可预填，结算时 actionSheet 最终确认，记账单结算后直接 DONE）；月报合计区含 合计/已支付/记账 三行
- 存取柜支付：STORAGE_PAY_MODE 0=现场,1=在线；STORAGE_PAY_STATUS 0=未付,1=已付(在线),2=免付(存柜),3=已确认收款(现场)；4→5 缴费确认后进取柜排队；在线支付 WXPAY_ENABLE=false 时司机走现场支付+管理员确认收款（过渡形态，商户号通过后仅改配置+部署 payNotify）；微信支付实现细节见 wxpay_lib.js / payNotify/index.js 头部注释（参考官方 Java 翻译生成，非官方维护），时间列仅保留创建日期（签到/叫号/完成/结算等时间不导出）
- 任务备注 QUEUE_REMARK：管理员录入/编辑，管理员+叉车司机可见，月报导出含备注列
- 管理员看板详情附司机注册信息（driverInfo：姓名/身份证/三证），凭证预览与保存相册统一走 `helper/cloud_helper.js` 的 `getTempUrl`/`previewCloudImage`（fileID 不能直接喂 wx.previewImage）
- 云调用防闪烁约定：静默请求必须传 `{title:'', hint:false}`（hint 默认 true 会弹全屏遮罩）；页面 `onShow` 首次跳过由 `onLoad` 处理
- 新路由在 `config/route.js` 注册；业务校验在 Service，Controller 只做参数校验与鉴权
- 文案用中文，UI 用 rpx，缩进用 tab

## 上线前清单（用户准备发布时，AI 必须主动逐项提醒）

- **用户隐私保护指引**（GPS 签到依赖）：小程序后台 mp.weixin.qq.com → 设置 → 服务内容声明 → 用户隐私保护指引，声明「位置信息」及用途；未配置时真机上 wx.getLocation 会报隐私协议错误（开发者工具模拟器不受影响）
- **微信支付启用检查**（商户号通过、WXPAY_ENABLE=true 时）：① 商户平台绑定小程序 appid、开通 JSAPI 支付；② 环境变量：cloud 函数 WXPAY_MCH_PRIVATE_KEY；payNotify 函数 WXPAY_API_V3_KEY/WXPAY_MCH_ID/WXPAY_APP_ID/WXPAY_MCH_PRIVATE_KEY/WXPAY_SERIAL_NO；③ payNotify 部署后控制台开启 HTTP 触发（云接入），config.WXPAY_NOTIFY_URL 填该地址，并添加每5分钟定时触发器（查单兜底）；④ 平台证书下载放 payNotify/certs/wechatpay_<序列号>.pem（*.pem 已 gitignore）；⑤ 0.01 元真机验证：支付→回调入队→重复通知幂等→取消支付→定时查单兜底

## 当前状态与下一步

- 当前（分支 dev-lizirui，2026-08-14，存取柜功能已开发未部署验证）：任务制重构、看板实时化、备注/固定费用、手机号授权、GPS 签到等均已部署；2026-08-14 新增存取柜全流程：独立排队（10 状态机）、司机登记（存柜码+柜门照必传）、吊柜工作台、管理员看板（叫号/派单/确认收款/柜型管理）、历史月报、按天计费；微信支付（APIv3 JSAPI + payNotify 回调验签解密 + 定时查单兜底）代码就绪，WXPAY_ENABLE=false 过渡形态（现场支付+管理员确认收款）端到端可用
- 2026-08-14 新增四项（已开发未部署验证）：司机业务选择页（driver/biz_select，仅装卸货/存柜/取柜三模块+进行中角标，司机端导航回接）；存柜柜门照上传修复（根因=内容安全检测服务未开通，上传统一显式跳过 isCheck 且失败返回空不误传本地路径）；登录页文案「叉车/吊柜司机」；叉车/吊柜身份拆分（USER_ROLE 新增 crane，登录按角色直达工作台、前端互斥重定向、后端 checkWorkRole 鉴权、存取柜看板派单/列表只含吊柜账号）；修复 initSetup 集合兜底（原逻辑超级管理员初始化后不再建新集合导致存取柜接口报错，现部署后首个请求自动补齐缺失集合）
- 2026-08-14 六项 UX（前端已生效，后端 myCurrent 需部署）：① biz_select 加退出登录；② 管理员预填单弹窗可滑动（call-panel max-height+overflow）；③ 存柜登记成功后跳转我的存柜（含取消分支）；④ 查看我的存柜入口只在存柜 tab 展示；⑤ 存柜页内嵌「我的存柜」区（存柜码+状态，myCurrent 存柜人记录改为覆盖 0-7 看板全阶段、取柜单按 _id 去重，取出后才消失）；⑥ 管理员装卸货/存取柜/后台三页底部并排三键切换（redirectTo）
- 下一步：① 重新部署 cloud 云函数（触发建 ax_storage/ax_storage_cabinet 集合 + 本轮身份拆分生效）→ 管理员把吊柜司机账号逐个改为吊柜身份 → 按计划验证存取柜全流程（存柜→叫号→吊柜→取柜缴费确认→叫号→取柜）+ 身份互斥（云开发控制台测试面板验证两工作台 API 互调被拒）+ 月报核对；② 商户号通过后按「上线前清单」微信支付启用检查项配置 → 0.01 元真机验证支付回调幂等；③ 可选后续：装卸服务费微信支付收款（记账单可复用 PAY_MODE/PAY_STATUS 字段）、交易账单下载 API 对账（官方 4012791866）
- 遗留：`projects/A00/` 模板页仍注册未清理；`behavior/`、`tpls/` 模板死引用待清；payNotify 定时查单与 cloud 下单/查单的微信应答未做平台证书验签（仅回调验签，代码注释已说明，如需严格验签可补）
- 注意：本机直连 GitHub 不稳定（2026-08 验证），克隆外部仓库用 ghfast.top 镜像；git push 直连失败时走本地代理（7892 端口，VPN 软件的 HTTP 代理）：`git -c http.proxy=http://127.0.0.1:7892 push`；本机 Python 不可用（Microsoft Store 空壳），微信支付 Skill 的知识库同步需手动 curl 下载 wx.gtimg.com 上的 zip
