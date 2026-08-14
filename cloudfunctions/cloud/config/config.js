module.exports = {

	//### 环境相关
	CLOUD_ID: 'cloud1-d8gyu2ikvf4aa3997', //你的云环境id

	// ##################################################################
	PID: 'A00',
	IS_DEMO: false,

	NEWS_CATE: '1=预约规则',
	MEET_TYPE: '1=小型车预约,2=大型车预约',
	QUEUE_ADMIN_OPENIDS: '', // 管理员微信openid，多个用英文逗号分隔；也可在ax_user中设置USER_ROLE=admin
	QUEUE_CANCEL_TEMPLATE_ID: '', // 队列取消订阅消息模板ID，配置后可通知司机重新预约
	// ##################################################################
	// #### 调试相关
	TEST_MODE: false,
	TEST_TOKEN_ID: '',

	COLLECTION_NAME: 'ax_admin|ax_cache|ax_counter|ax_day|ax_export|ax_join|ax_log|ax_meet|ax_news|ax_setup|ax_temp|ax_user|ax_queue|ax_storage|ax_storage_cabinet',

	DATA_EXPORT_PATH: 'export/', //数据导出路径
	MEET_TIMEMARK_QR_PATH: 'meet/usercheckin/', //用户签到码路径
	SETUP_PATH: 'setup/',

	// ## 缓存相关
	IS_CACHE: true, //是否开启缓存
	CACHE_CALENDAR_TIME: 60 * 30, //日历缓存

	// #### 内容安全
	CLIENT_CHECK_CONTENT: false, //前台图片文字是否校验
	ADMIN_CHECK_CONTENT: false, //后台图片文字是否校验

	// #### 预约相关
	MEET_LOG_LEVEL: 'debug',

	// ### 后台业务相关
	ADMIN_LOGIN_EXPIRE: 86400, //管理员token过期时间 (秒)

	// #### 微信支付（存取柜取柜交款）
	WXPAY_ENABLE: false, //是否开通在线支付；商户号未就绪时保持 false，司机走现场支付+管理员确认收款
	WXPAY_MCH_ID: '', //商户号
	WXPAY_APP_ID: '', //小程序appid
	WXPAY_SERIAL_NO: '', //商户API证书序列号
	WXPAY_NOTIFY_URL: '', //支付回调完整URL（payNotify 云函数 HTTP 触发地址，例：https://<环境ID>.service.tcloudbase.com/payNotify）
	// 敏感密钥不入代码，配置到云函数环境变量：
	//   cloud 函数：WXPAY_MCH_PRIVATE_KEY（商户API证书私钥 PEM 文本，换行可用 \n 转义）
	//   payNotify 函数：WXPAY_API_V3_KEY（APIv3密钥32字节）、WXPAY_MCH_ID、WXPAY_APP_ID；平台证书放 payNotify/certs/wechatpay_<序列号>.pem（已 gitignore）
}