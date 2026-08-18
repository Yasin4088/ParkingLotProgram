const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const app = getApp();

Page({
	data: {
		tab: 'store', // store=存柜, fetch=取柜
		plate: '',
		fetchPlate: '',
		phone: '',
		cabinets: [],
		cabinetIndex: -1,
		cabinetNo: '',
		doorProof: '',
		doorProofLocal: '',
		storeCompany: 0, // 存柜登记所属公司 0=挚力(计费),1=其他(不计费)
		storeCompanyIndex: 0,
		companyItems: [{ label: '挚力', value: 0 }, { label: '其他', value: 1 }],
		fetchCode: '',
		calc: null,
		calcLoading: false,
		submitting: false,
		wxpayEnable: false,
		myList: [],
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function (options) {
		this._initNavMetrics();
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		if (options && options.tab === 'fetch') this.setData({ tab: 'fetch' });
		await this._loadOptions();
		this._prefill();
		await this._loadMyStorage();
		this._loaded = true;
	},

	onShow: async function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		this._checkLogin();
		this._prefill();
		this._loadMyStorage();
	},

	_checkLogin: function () {
		let user = cacheHelper.get(constants.CACHE_TOKEN);
		if (!user || !user.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	_checkRegistration: async function () {
		try {
			let driverInfo = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '', hint: false });
			if (!driverInfo || !driverInfo.USER_IDCARD) {
				wx.redirectTo({ url: '/pages/driver/register/register' });
				return false;
			}
			return true;
		} catch (err) {
			console.error('检查注册状态失败', err);
			return false;
		}
	},

	/** 柜型列表 + 在线支付开关 */
	_loadOptions: async function () {
		try {
			let res = await cloudHelper.callCloudData('storage/options', {}, { title: '', hint: false });
			let cabinets = (res.cabinets || []).map(c => ({
				id: c._id,
				name: c.name,
				text: c.name + '（¥' + c.priceDailyText + '/天）',
			}));
			this.setData({
				cabinets,
				wxpayEnable: !!res.wxpayEnable,
				cabinetIndex: cabinets.length ? 0 : -1,
			});
		} catch (err) {
			console.error('加载存取柜选项失败', err);
			wx.showToast({ title: '加载失败，请重试', icon: 'none' });
		}
	},

	/** 我的存柜（存柜页直接展示，取出前一直可见，防止忘记存柜码） */
	_loadMyStorage: async function () {
		try {
			let res = await cloudHelper.callCloudData('storage/my_current', {}, { title: '', hint: false });
			this.setData({ myList: (res && res.list) || [] });
		} catch (err) {
			console.log(err);
		}
	},

	/** 预填注册时登记的车牌与手机号（可修改）；取柜车牌独立预填 */
	_prefill: async function () {
		try {
			let driverInfo = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '', hint: false });
			if (!driverInfo) return;
			let data = {};
			if (!this.data.plate && driverInfo.USER_LICENSE_PLATE) {
				data.plate = driverInfo.USER_LICENSE_PLATE.toUpperCase();
			}
			if (!this.data.fetchPlate && driverInfo.USER_LICENSE_PLATE) {
				data.fetchPlate = driverInfo.USER_LICENSE_PLATE.toUpperCase();
			}
			if (!this.data.phone && driverInfo.USER_MOBILE) {
				data.phone = driverInfo.USER_MOBILE;
			}
			if (Object.keys(data).length) this.setData(data);
		} catch (err) {
			console.log(err);
		}
	},

	_initNavMetrics: function () {
		let statusBar = app.globalData.statusBar || 0;
		let customBar = app.globalData.customBar || 0;

		if (!statusBar || !customBar) {
			let systemInfo = wx.getSystemInfoSync();
			let capsule = wx.getMenuButtonBoundingClientRect();
			statusBar = systemInfo.statusBarHeight || 0;
			customBar = capsule ? capsule.bottom + capsule.top - statusBar : statusBar + 50;
		}

		this.setData({
			statusBar,
			customBar,
			navBarHeight: customBar - statusBar,
		});
	},

	bindPlateInput: function (e) {
		this.setData({ plate: e.detail.value.toUpperCase() });
	},

	bindFetchPlateInput: function (e) {
		this.setData({ fetchPlate: e.detail.value.toUpperCase() });
	},

	bindPhoneInput: function (e) {
		this.setData({ phone: e.detail.value });
	},

	bindCabinetChange: function (e) {
		this.setData({ cabinetIndex: Number(e.detail.value) });
	},

	bindStoreCompanyChange: function (e) {
		let index = Number(e.detail.value);
		let item = this.data.companyItems[index];
		this.setData({
			storeCompanyIndex: index,
			storeCompany: item ? item.value : 0,
		});
	},

	bindCabinetNoInput: function (e) {
		this.setData({ cabinetNo: e.detail.value });
	},

	bindFetchCodeInput: function (e) {
		this.setData({ fetchCode: e.detail.value.trim() });
	},

	bindChooseDoorProof: function () {
		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles[0].tempFilePath;
				try {
					let cloudId = await cloudHelper.transTempPicOne(filePath, 'storage/door/', '', false);
					if (!cloudId) {
						wx.showToast({ title: '上传失败，请重试', icon: 'none' });
						return;
					}
					this.setData({
						doorProof: cloudId,
						doorProofLocal: filePath,
					});
				} catch (e) {
					console.log(e);
					wx.showToast({ title: '上传失败，请重试', icon: 'none' });
				}
			}
		});
	},

	/** 存柜登记：免费，自动记录时间，生成存柜码与排队号 */
	bindStoreSubmit: async function () {
		if (this.data.submitting) return;

		let plate = (this.data.plate || '').trim().toUpperCase();
		if (!plate || plate.length < 3) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
		if (!/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
		if (this.data.cabinetIndex < 0 || !this.data.cabinets[this.data.cabinetIndex]) return wx.showToast({ title: '请选择柜型', icon: 'none' });
		if (!this.data.cabinetNo.trim()) return wx.showToast({ title: '请输入柜号', icon: 'none' });
		if (!this.data.doorProof) return wx.showToast({ title: '请上传柜门照片', icon: 'none' });

		this.setData({ submitting: true });
		try {
			let res = await cloudHelper.callCloudSumbit('storage/store_register', {
				plate,
				phone: this.data.phone,
				cabinetId: this.data.cabinets[this.data.cabinetIndex].id,
				cabinetNo: this.data.cabinetNo.trim(),
				doorProof: this.data.doorProof,
				company: this.data.storeCompany,
			}, { title: '提交中' });

			let companyDesc = this.data.storeCompany === 1 ? '（其他公司，不计费）' : '';
			wx.showModal({
				title: '存柜登记成功',
				content: '存柜码：' + res.data.STORAGE_CODE + '\n排队号：' + res.data.STORAGE_NO + companyDesc + '\n\n请保存存柜码，取柜时凭码登记',
				confirmText: '复制存柜码',
				success: r => {
					if (r.confirm) {
						wx.setClipboardData({
							data: res.data.STORAGE_CODE,
							success: () => wx.showToast({ title: '存柜码已复制', icon: 'success' })
						});
					}
					setTimeout(() => {
						wx.redirectTo({ url: '/driver/storage_my' });
					}, 800);
				}
			});
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	/** 取柜费用预览（按天计费，不足1天按1天；附月付车牌识别提示，不占用月付池） */
	bindFetchCalc: async function () {
		if (this.data.calcLoading) return;

		let code = this.data.fetchCode;
		if (!/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入 6 位存柜码', icon: 'none' });

		wx.hideKeyboard();
		this.setData({ calcLoading: true });
		try {
			// 用 callCloud 直取错误信息（callCloudData 会吞掉失败原因，导致点查询无任何反应）
			let res = await cloudHelper.callCloud('storage/fetch_calc', {
				code,
				plate: (this.data.fetchPlate || '').trim().toUpperCase(),
			}, { title: '', hint: false });
			this.setData({ calc: res.data });
			// 费用区展开后自动滚到底部，避免结果被屏幕下端遮挡
			setTimeout(() => {
				wx.pageScrollTo({ scrollTop: 10000, duration: 200 });
			}, 100);
		} catch (e) {
			this.setData({ calc: null });
			wx.showToast({ title: (e && e.msg) || '查询失败，请重试', icon: 'none' });
		} finally {
			this.setData({ calcLoading: false });
		}
	},

	/** 取柜登记：月付车牌自动识别免现场缴费直接入队；否则锁定费用待缴费 */
	bindFetchSubmit: async function () {
		if (this.data.submitting) return;

		let code = this.data.fetchCode;
		if (!/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入 6 位存柜码', icon: 'none' });
		if (!this.data.calc) return wx.showToast({ title: '请先查询费用', icon: 'none' });
		if (!/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });

		let payMode = this.data.wxpayEnable ? 1 : 0; // 在线支付已开通，取柜缴费默认走在线支付（未开通时回退现场支付+管理员确认收款）
		let fetchPlate = (this.data.fetchPlate || '').trim().toUpperCase();

		this.setData({ submitting: true });
		try {
			let res = await cloudHelper.callCloudSumbit('storage/fetch_register', {
				code,
				phone: this.data.phone,
				payMode,
				plate: fetchPlate,
			}, { title: '提交中' });

			let data = res.data || {};
			if (data.noCharge) {
				// 其他公司单：不计费不付款，直接进入取柜排队
				wx.showModal({
					title: '登记成功',
					content: '该存柜属于其他公司，不计费，已直接进入取柜排队。',
					showCancel: false,
					success: () => {
						setTimeout(() => {
							wx.redirectTo({ url: '/driver/storage_my' });
						}, 800);
					}
				});
			} else if (data.monthly) {
				// 月付：免现场缴费，直接进入取柜排队（费用记公司月结）
				wx.showModal({
					title: '月付免现场缴费',
					content: '识别到月付车牌 ' + (data.fetchPlate || '') + '，本单费用记公司月结，已直接进入取柜排队。',
					showCancel: false,
					success: () => {
						setTimeout(() => {
							wx.redirectTo({ url: '/driver/storage_my' });
						}, 800);
					}
				});
			} else if (this.data.wxpayEnable && payMode === 1) {
				// 在线支付：下单 → 拉起微信支付 → 支付回调推进排队
				await this._doPay(data._id);
			} else {
				wx.showToast({ title: '登记成功，请现场缴费', icon: 'none' });
				setTimeout(() => {
					wx.redirectTo({ url: '/driver/storage_my' });
				}, 1200);
			}
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	/** 在线支付：storage/pay 下单 + wx.requestPayment（查单兜底发现已支付时不再拉起支付） */
	_doPay: async function (id) {
		let payRes = await cloudHelper.callCloudSumbit('storage/pay', { id }, { title: '下单中' });
		if (payRes.data.paid) {
			wx.showToast({ title: '已支付，进入排队', icon: 'success' });
		} else {
			await new Promise((resolve, reject) => {
				wx.requestPayment({
					...payRes.data.payParams,
					success: resolve,
					fail: err => {
						if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) {
							wx.showToast({ title: '已取消支付', icon: 'none' });
							resolve();
						} else {
							reject(err);
						}
					}
				});
			});
			wx.showToast({ title: '支付成功，已进入排队', icon: 'success' });
		}
		setTimeout(() => {
			wx.redirectTo({ url: '/driver/storage_my' });
		}, 1200);
	},

	bindMyTap: function () {
		wx.navigateTo({ url: '/driver/storage_my' });
	},

	bindBackTap: function () {
		wx.redirectTo({ url: '/driver/biz_select' });
	},
});
