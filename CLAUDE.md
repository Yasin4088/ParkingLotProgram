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
  admin/queue.*       # 管理员叫号看板（状态筛选、10s自动刷新、自动/人工叫号开关、叫号/派单/费用/结算）
  admin/storage.*     # 管理员存取柜看板（独立排队、自动/人工叫号开关、叫号/派单/确认收款/柜型管理）
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
- 工作身份：USER_ROLE 值 driver=司机,admin=管理员,forklift=叉车司机,crane=吊柜司机,customer=客户（月付车牌录入）；叉车/吊柜登录后按角色直达各自工作台（叉车=装卸货，吊柜=存取柜），后端 base_controller.checkWorkRole 强制互斥（两工作台 API 互调报「账号无操作权限」）；管理员端叉车/吊柜列表合并管理、编辑页可设身份
- 存取柜状态机：0待叫号·存柜→1已叫号·存柜→2存柜执行中→3已存柜→4取柜待缴费→5取柜待叫号→6已叫号·取柜→7取柜执行中→8已取柜/9已取消（管理员可取消看板任意状态）；计费起点=存柜完成时间（吊柜拍照确认），按天计费不足1天按1天（天数×柜型日单价，费用在取柜登记时服务端重算锁定）；存柜码6位数字为取柜凭证；存柜登记与取柜缴费确认各生成一次排队号（当天全局序号，payNotify 内同算法副本需同步修改）
- 费用：固定项 办单费/过磅费/拆箱费/吊机费/存柜费 + 可自定义；≤3 状态经编辑表单保存（预估），4/5/6 经费用弹窗整体保存（现场，支付前可改）；金额单位分，前端展示换算元；预估费用金额为 0/留空不计入，现场费用仍要求 >0
- 支付：PAY_STATUS 0=未支付,1=已支付,2=免支付,3=记账；PAY_MODE 0=现场支付,1=客户记账（建单/编辑可预填，结算时 actionSheet 最终确认，记账单结算后直接 DONE）；月报合计区含 合计/已支付/记账 三行
- 存取柜支付：STORAGE_PAY_MODE 0=现场,1=在线；STORAGE_PAY_STATUS 0=未付,1=已付(在线),2=免付(存柜),3=已确认收款(现场),4=月付(月结,免现场缴费,费用记公司月结)；4→5 缴费确认后进取柜排队（月付单取柜登记时直接 3→5 跳过缴费环节）；在线支付 WXPAY_ENABLE=false 时司机走现场支付+管理员确认收款（过渡形态，商户号通过后仅改配置+部署 payNotify）；微信支付实现细节见 wxpay_lib.js / payNotify/index.js 头部注释（参考官方 Java 翻译生成，非官方维护），时间列仅保留创建日期（签到/叫号/完成/结算等时间不导出）
- GPS 签到校验：司机签到须在装卸区半径内（config.js `CHECKIN_LOT`：lat/lng=堆场中心 gcj02 坐标，radiusM=允许半径米；当前 22.67/113.64/5000，坐标为 0 或半径 0 时不校验）；queue_service.checkin 用 haversine 算距离超半径拒绝签到；司机端 queue.js 签到失败会弹具体原因
- 任务备注 QUEUE_REMARK：管理员录入/编辑，管理员+叉车司机可见，月报导出含备注列
- 管理员看板详情附司机注册信息（driverInfo：姓名/身份证/三证），凭证预览与保存相册统一走 `helper/cloud_helper.js` 的 `getTempUrl`/`previewCloudImage`（fileID 不能直接喂 wx.previewImage）
- 云调用防闪烁约定：静默请求必须传 `{title:'', hint:false}`（hint 默认 true 会弹全屏遮罩）；页面 `onShow` 首次跳过由 `onLoad` 处理
- 新路由在 `config/route.js` 注册；业务校验在 Service，Controller 只做参数校验与鉴权
- 文案用中文，UI 用 rpx，缩进用 tab

## 上线前清单（用户准备发布时，AI 必须主动逐项提醒）

- **用户隐私保护指引**（GPS 签到依赖）：小程序后台 mp.weixin.qq.com → 设置 → 服务内容声明 → 用户隐私保护指引，声明「位置信息」及用途；未配置时真机上 wx.getLocation 会报隐私协议错误（开发者工具模拟器不受影响）
- **微信支付启用检查**（商户号通过、WXPAY_ENABLE=true 时）：① 商户平台绑定小程序 appid、开通 JSAPI 支付；② 环境变量：cloud 函数 WXPAY_MCH_PRIVATE_KEY；payNotify 函数 WXPAY_API_V3_KEY/WXPAY_MCH_ID/WXPAY_APP_ID/WXPAY_MCH_PRIVATE_KEY/WXPAY_SERIAL_NO；③ 定时触发器已内置 payNotify/config.json（每5分钟查单兜底，随部署自动创建）；HTTP 触发在云开发控制台「云接入/HTTP网关」给 payNotify 配访问路径（不是函数详情里的触发配置 tab，微信云开发没有该 tab），config.WXPAY_NOTIFY_URL 填得到的 URL；④ 回调验签密钥放 payNotify/certs/（*.pem 已 gitignore）：老商户平台证书 wechatpay_<序列号>.pem，新商户（/v3/certificates 报「无平台证书」）用微信支付公钥 wechatpay_<PUB_KEY_ID_数字串>.pem（商户平台-账户中心-API安全 申请下载，本商户 2026-08 即公钥模式）；⑤ 0.01 元真机验证：支付→回调入队→重复通知幂等→取消支付→定时查单兜底

## 当前状态与下一步

- 当前（分支 dev-lizirui，2026-08-14，存取柜功能已开发未部署验证）：任务制重构、看板实时化、备注/固定费用、手机号授权、GPS 签到等均已部署；2026-08-14 新增存取柜全流程：独立排队（10 状态机）、司机登记（存柜码+柜门照必传）、吊柜工作台、管理员看板（叫号/派单/确认收款/柜型管理）、历史月报、按天计费；微信支付（APIv3 JSAPI + payNotify 回调验签解密 + 定时查单兜底）代码就绪，WXPAY_ENABLE=false 过渡形态（现场支付+管理员确认收款）端到端可用
- 分支约定：工作分支 dev-lizirui；master 为旧框架（落后 dev-lizirui 31 提交、旧模板 appid wx3decd5e9b69b1b7e、仅 6 个页面），origin/HEAD 指向 master → 他人 clone/网页下载默认拿到 master 旧版，必须显式指定 dev-lizirui
- 2026-08-14 新增四项（已开发未部署验证）：司机业务选择页（driver/biz_select，仅装卸货/存柜/取柜三模块+进行中角标，司机端导航回接）；存柜柜门照上传修复（根因=内容安全检测服务未开通，上传统一显式跳过 isCheck 且失败返回空不误传本地路径）；登录页文案「叉车/吊柜司机」；叉车/吊柜身份拆分（USER_ROLE 新增 crane，登录按角色直达工作台、前端互斥重定向、后端 checkWorkRole 鉴权、存取柜看板派单/列表只含吊柜账号）；修复 initSetup 集合兜底（原逻辑超级管理员初始化后不再建新集合导致存取柜接口报错，现部署后首个请求自动补齐缺失集合）
- 2026-08-14 六项 UX（前端已生效，后端 myCurrent 需部署）：① biz_select 加退出登录；② 管理员预填单弹窗可滑动（call-panel max-height+overflow）；③ 存柜登记成功后跳转我的存柜（含取消分支）；④ 查看我的存柜入口只在存柜 tab 展示；⑤ 存柜页内嵌「我的存柜」区（存柜码+状态，myCurrent 存柜人记录改为覆盖 0-7 看板全阶段、取柜单按 _id 去重，取出后才消失）；⑥ 管理员装卸货/存取柜/后台三页底部并排三键切换（redirectTo）
- 2026-08-14 安全加固三轮（已提交未部署，commit 2f8186f/8c84f60/2597445+解绑按钮）：**司机端接口身份改为服务端 OPENID**（弃用前端 token 身份，getDriverId 按 USER_MINI_OPENID 查证）；**叉车/吊柜账号首登绑定本机微信 OPENID**（USER_WX_OPENID，先登先绑、换设备由管理员编辑页「清除微信绑定」解绑，checkWorkRole 校验绑定）；叉车/吊柜登录失败锁定（5 次/15 分钟）；myCurrent/取柜登记响应脱敏（不再下发用户 _id/OPENID/三证照/支付订单号）；clear_cache 补鉴权；user_list 去敏感字段；setupAdmin 事务防双超管；**发号改事务计数器 ax_counter**（_id=CNT_{PID}_{prefix}_{day}，种子=当日已有记录数，QUEUE_NO/STORAGE_NO 防并发撞号，payNotify 内有同算法副本需同步维护）；装卸/存取柜状态流转全部条件编辑（失败报「状态已变化，请刷新」）；pay() 下单竞态修复；payNotify markPaid 事务幂等（发号+入队原子）；存柜支付前端 res.data 层级修复（在线支付/成功弹窗原为静默失效）；initSetup 热缓存；我的存柜 N+1 改内存计算
- 2026-08-15 自动叫号（已开发未部署，与安全加固同批部署 cloud 即生效）：装卸货、存取柜**各一个独立开关**（存 ax_setup 的 SETUP_QUEUE_AUTO_CALL/SETUP_STORAGE_AUTO_CALL，管理员看板顶部 switch 切换，admin/queue_auto_call + admin/storage_auto_call 路由）；策略=无未接单的叫号时自动叫排队最早的一单（最多 1 单待接单，叉车/吊柜接单后自动叫下一位，存取柜存柜/取柜按排队时间全局取最早）；触发点=签到/存柜登记/支付入队/收款确认/抢单/派单即时触发 + 管理员看板 10s 轮询 + 叉车/吊柜工作台轮询兜底（看板未打开也能自动叫号）；自动叫号失败仅 console.error 不影响主流程；条件编辑防并发重复叫号；注意：自动模式下管理员「收回叫号」会被 10s 兜底自动重新叫号，需暂停时切回人工模式
- 2026-08-15 存取柜月付（月结）（已开发未部署）：存取柜客户分月付/到付，到付=原取柜模式不动；**新账号类型「客户」**（ax_user USER_ROLE=customer，仅超级管理员在后台「客户管理」创建/编辑/删除，登录页新增「客户」Tab，登录后进 pages/customer/home 管理月付车牌池）；客户录入月付司机车牌 → **取柜登记时按取柜司机车牌自动匹配月付池**（司机取柜页新增「取柜车牌」输入，预填注册车牌，可改），命中则本单免现场缴费直接进取柜排队（STORAGE_PAY_STATUS 新增 4=月付(月结)，费用照记供公司月结，STORAGE_MONTHLY=1 + 客户快照字段），未命中/未填默认现场支付（原逻辑）；**池内每个车牌条目单次有效**：取柜登记时锁定（ax_storage_mplate MPLATE_STATUS 0有效→1占用，条件更新防并发双占）→ 吊柜取柜完成时消去（1→2，从池中消失，对应「月付柜被提走后车牌消去」）→ 月付单中途被管理员取消自动释放回池（1→0）；司机端全程不出现月结选项（防自报月结造假）；月报新增「月结客户」列 + 月结(元) 合计行；管理员看板卡片「月付」徽标 + 详情月结客户/取柜车牌；6 位存柜码链路未加校验（已接受风险不破坏）；集合 ax_storage_mplate 已入 config.COLLECTION_NAME（部署后首个请求自动建表）；部署需重新上传 cloud 云函数
- 2026-08-15 公司栏 + 其他管理员权限（已开发未部署，与月付同批部署）：**「普通管理员」改名为「其他管理员」**（TYPE_DESC/管理页/后台首页标签），超级管理员不变（挚力公司全流程）；**装卸货预填单与存柜登记都加「公司」栏（0=挚力,1=其他，QUEUE_COMPANY/STORAGE_COMPANY）**；装卸货：其他公司单叫号后直接置 DONE（不进叉车池、无费用/结算/支付、不留历史，历史列表/月报按 QUEUE_COMPANY['<>',1] 排除），挚力单全流程不变，两类单共用排队叫号（自动/手动叫号均分流）；存取柜：其他公司单存柜登记照常、取柜登记直接 3→5 入队（STORAGE_PAY_STATUS 新增 5=不计费(其他公司)，跳过费用计算/月付识别/支付），历史/月报排除；**权限矩阵**：其他管理员=装卸货仅可预填其他单+叫号其他单+取消其他单（挚力单只能看不能操作），存取柜仅可见/操作其他单（服务端按级别过滤+校验），无柜型管理/确认收款/自动叫号开关/历史/月结导出/管理员管理/客户管理（这些接口全部 isSuperAdmin 守卫）；司机端 queue/confirm 兼容其他单已 DONE 的重复确认；其他公司单记录保留在库但全部视图排除（不物理删除）；存柜登记公司由司机自选（沿用信任模型，存在自报其他公司规避计费风险，如需可后续限制仅管理员可指定）
- 部署注意（本轮安全加固上线）：① 重新部署 cloud 与 payNotify **同一窗口**（发号算法副本需一致）；② 存量叉车/吊柜司机需**重新登录一次**（登录即绑定本机微信，旧缓存 token 会因未绑定被拒）；③ 控制台清单：cloud 云函数超时 3s→**10s**；建索引 ax_queue(QUEUE_STATUS/QUEUE_USER_ID/QUEUE_CHECKIN_TIME)、ax_storage(STORAGE_STATUS/STORAGE_USER_ID/STORAGE_FETCH_USER_ID/STORAGE_QUEUE_TIME/STORAGE_CODE/STORAGE_CABINET_NO/STORAGE_PAY_OUT_TRADE_NO/STORAGE_FORKLIFT_ID)、ax_user(USER_MINI_OPENID/USER_ROLE/USER_NAME)、ax_admin(ADMIN_TOKEN/ADMIN_NAME)；④ 全部集合权限确认「仅云函数可读写」；⑤ 重新部署触发建 ax_storage/ax_storage_cabinet/ax_counter 集合 + 身份拆分生效 → 管理员把吊柜司机账号逐个改为吊柜身份 → 按计划验证存取柜全流程（存柜→叫号→吊柜→取柜缴费确认→叫号→取柜）+ 身份互斥（云开发控制台测试面板验证两工作台 API 互调被拒、司机 B token=他人 _id 被拒）+ 月报核对
- 下一步：① 商户号通过后按「上线前清单」微信支付启用检查项配置 → 0.01 元真机验证支付回调幂等；② 可选后续：装卸服务费微信支付收款（记账单可复用 PAY_MODE/PAY_STATUS 字段）、交易账单下载 API 对账（官方 4012791866）；③ 存取柜月付已按「车牌白名单自动匹配 + 取柜登记后直接入队」方案落地（见上文 2026-08-15 存取柜月付条目），待部署后验证：超管建客户账号→客户录入车牌→月付司机取柜免付入队→提柜后车牌消去→取消月付单车牌释放；可选增强：月付客户月结对账导出（按客户汇总当月月结金额）
- 已接受风险（用户决策，勿加校验）：取柜链路 6 位存柜码即凭证（fetch_calc/fetch_register 无需登录/限频）；取柜人身份仍按客户端 token 写入（设计取舍）
- 遗留：`projects/A00/` 模板页仍注册未清理；`behavior/`、`tpls/` 模板死引用待清；payNotify 定时查单与 cloud 下单/查单的微信应答未做平台证书验签（仅回调验签，代码注释已说明，如需严格验签可补）；内容安全检测全关（config.js:30-31，服务市场开通后恢复）；管理员 token 明文存库、无登出（后续）
- 注意：本机直连 GitHub 不稳定（2026-08 验证），克隆外部仓库用 ghfast.top 镜像；git push 直连失败时走本地代理（7892 端口，VPN 软件的 HTTP 代理）：`git -c http.proxy=http://127.0.0.1:7892 push`；本机 Python 不可用（Microsoft Store 空壳），微信支付 Skill 的知识库同步需手动 curl 下载 wx.gtimg.com 上的 zip
- 朋友协作（2026-08-15）：朋友 clone 必须指定 dev-lizirui（见分支约定）；编译需 appid 权限（wx6425c8398684c540，加朋友为开发者成员，或朋友换自己 appid+云环境并改 miniprogram/setting/setting.js 的 CLOUD_ID、部署 cloud/payNotify 云函数）；libVersion 3.17.0 需新版开发者工具；project.private.config.json 本不该入库，朋友本地可删除
