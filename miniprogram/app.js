const setting = require('./setting/setting.js');

App({
	onLaunch: function (options) {

		if (!wx.cloud) {
			console.error('请使用 2.2.3 或以上的基础库以使用云能力')
		} else {
			wx.cloud.init({
				// env 参数说明：
				//   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
				//   此处请填入环境 ID, 环境 ID 可打开云控制台查看
				//   如不填则使用默认环境（第一个创建的环境）
				// env: 'my-env-id',
				env: setting.CLOUD_ID,
				traceUser: true,
			})
		}

		this.globalData = {};

		// 隐私授权统一处理（基础库 2.32.3+，配合 app.json "__usePrivacyCheck__": true）：
		// 任意隐私接口（getLocation 定位、chooseMedia 相册/摄像头等）首次调用且用户未同意时，
		// 自动弹出系统隐私弹窗，用户同意后原接口继续执行；不同意则接口返回失败。
		if (wx.onNeedPrivacyAuthorization) {
			wx.onNeedPrivacyAuthorization(resolve => {
				wx.requirePrivacyAuthorize({
					success: () => resolve({ event: 'agree' }),
					fail: () => resolve({ event: 'disagree' })
				});
			});
		}

		// 用于自定义导航栏
		wx.getSystemInfo({
			success: e => {
				this.globalData.statusBar = e.statusBarHeight;
				let capsule = wx.getMenuButtonBoundingClientRect();
				if (capsule) {
					this.globalData.custom = capsule;
					this.globalData.customBar = capsule.bottom + capsule.top - e.statusBarHeight;
				} else {
					this.globalData.customBar = e.statusBarHeight + 50;
				} 
			}
		});
	},


	/*
	onShow: function (options) {
		// 启动，或者从后台进入前台
		//GroupBiz.initGroupShareTicket(options);
	},
	onHide: function () {
		// 小程序从前台进入后台
		//GroupBiz.clearGroupShareTicket();
	}*/
})