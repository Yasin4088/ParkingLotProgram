const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

// 状态 → 卡片/徽标配色（复用装卸看板配色）
const STATUS_CLASS = {
	0: 'st-waiting',
	1: 'st-called',
	2: 'st-executing',
	3: 'st-booked',
	4: 'st-topay',
	5: 'st-waiting',
	6: 'st-called',
	7: 'st-executing',
};

// 状态统计条（文案与后端 StorageModel.STATUS_DESC 一致）
const STATUS_ITEMS = [
	{ status: 0, label: '待叫号·存柜' },
	{ status: 1, label: '已叫号·存柜' },
	{ status: 2, label: '存柜执行中' },
	{ status: 3, label: '已存柜' },
	{ status: 4, label: '取柜待缴费' },
	{ status: 5, label: '取柜待叫号' },
	{ status: 6, label: '已叫号·取柜' },
	{ status: 7, label: '取柜执行中' },
];

// 状态 → 用时起始时间戳字段
const ELAPSED_FIELD = {
	0: 'STORAGE_ADD_TIME',
	1: 'STORAGE_CALL_TIME',
	2: 'STORAGE_FORKLIFT_GRAB_TIME',
	3: 'STORAGE_FINISH_TIME',
	4: 'STORAGE_FETCH_TIME',
	5: 'STORAGE_QUEUE_TIME',
	6: 'STORAGE_CALL_TIME',
	7: 'STORAGE_FORKLIFT_GRAB_TIME',
};

Page({
	data: {
		list: [],
		displayList: [],
		stats: [],
		total: 0,
		filterStatus: '',
		loading: false,
		submitting: false,

		// 详情弹窗
		showDetail: false,
		selectedItem: null,
		cancelReason: '',

		// 叫号确认弹窗
		showCallModal: false,
		callTarget: null,
		callLoading: false,

		// 手动派单弹窗
		showAssignModal: false,
		assignTarget: null,
		assignForkliftList: [],
		assignIndex: 0,
		assignLoading: false,

		// 柜型管理弹窗
		showCabinetModal: false,
		cabinets: [],
		cabinetLoading: false,
		cabinetEdit: false, // false=列表模式, true=编辑表单
		cabinetForm: {
			id: '',
			name: '',
			priceDailyYuan: '',
			statusIndex: 0,
			order: '',
		},
		cabinetStatusOptions: [
			{ value: 1, name: '启用' },
			{ value: 9, name: '禁用' },
		],
		cabinetSaveLoading: false,
	},

	onLoad: function () {
		this._checkLogin();
		this.loadList();
	},

	onShow: function () {
		if (wx.hideHomeButton) wx.hideHomeButton();
		this.loadList();
		this._startTimer();
	},

	onHide: function () {
		this._stopTimer();
	},

	onUnload: function () {
		this._stopTimer();
	},

	/** 10 秒自动刷新；弹窗打开时暂停，避免打断操作 */
	_startTimer: function () {
		this._stopTimer();
		this._timer = setInterval(() => {
			if (this._modalOpen()) return;
			this.loadList();
		}, 10000);
	},

	_stopTimer: function () {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
	},

	_modalOpen: function () {
		let d = this.data;
		return d.showDetail || d.showCallModal || d.showAssignModal || d.showCabinetModal;
	},

	_checkLogin: function () {
		let admin = cacheHelper.get(constants.CACHE_ADMIN);
		if (!admin || !admin.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	loadList: async function () {
		if (this._refreshing) return;
		this._refreshing = true;
		try {
			let data = await cloudHelper.callCloudData('admin/storage_list', {}, { title: '', hint: false });
			if (!data) return;
			let list = (data.list || []).map(item => {
				item.statusClass = STATUS_CLASS[item.STORAGE_STATUS] || 'st-booked';
				item.elapsedText = this._elapsedText(item);
				return item;
			});
			let stats = STATUS_ITEMS.map(s => ({ status: s.status, key: String(s.status), label: s.label, count: 0 }));
			let statMap = {};
			stats.forEach(s => statMap[s.status] = s);
			list.forEach(item => {
				if (statMap[item.STORAGE_STATUS]) statMap[item.STORAGE_STATUS].count++;
			});
			this.setData({
				list,
				stats,
				total: list.length,
				displayList: this._filterList(list, this.data.filterStatus),
			});
		} catch (e) {
			console.log(e);
		} finally {
			this._refreshing = false;
		}
	},

	/** 当前环节用时文案（起始时间戳为空则不显示） */
	_elapsedText: function (item) {
		let field = ELAPSED_FIELD[item.STORAGE_STATUS];
		let start = item[field];
		if (!start) return '';
		let diff = Date.now() - Number(start);
		if (diff < 60 * 1000) return '刚刚';
		let minutes = Math.floor(diff / 60000);
		if (minutes < 60) return minutes + ' 分钟';
		return Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分钟';
	},

	/** 按状态筛选（s 为 '' 时显示全部） */
	_filterList: function (list, s) {
		if (!s) return list;
		return list.filter(item => String(item.STORAGE_STATUS) === s);
	},

	bindFilterTap: function (e) {
		let key = e.currentTarget.dataset.key;
		let next = (this.data.filterStatus === key) ? '' : key;
		this.setData({
			filterStatus: next,
			displayList: this._filterList(this.data.list, next),
		});
	},

	// ========== 叫号 ==========

	bindCallTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this.setData({ showCallModal: true, callTarget: item });
	},

	bindDetailCallTap: function () {
		if (!this.data.selectedItem) return;
		this.setData({ showCallModal: true, callTarget: this.data.selectedItem });
	},

	bindCloseCallModal: function () {
		this.setData({ showCallModal: false, callTarget: null });
	},

	bindConfirmCall: async function () {
		if (this.data.callLoading) return;
		let target = this.data.callTarget;
		if (!target) return;

		this.setData({ callLoading: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/storage_call', {
				id: target._id,
			}, { title: '叫号中' });

			let data = res && res.data ? res.data : res;
			let isStore = Number(data.STORAGE_STATUS) === 1;
			wx.showModal({
				title: '叫号成功',
				content: '请 ' + (data.STORAGE_NO || '') + ' 号，车牌 ' + data.STORAGE_PLATE + ' 前往' + (isStore ? '存柜区' : '取柜区') + '\n吊柜司机将自行抢单',
				showCancel: false,
			});

			this.setData({ showCallModal: false, callTarget: null });
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ callLoading: false });
		}
	},

	// ========== 收回叫号 ==========

	bindRecallTap: function (e) {
		let id = e.currentTarget.dataset.id;
		this._recall(id);
	},

	bindDetailRecallTap: function () {
		if (!this.data.selectedItem) return;
		this._recall(this.data.selectedItem._id);
	},

	_recall: function (id) {
		let that = this;
		wx.showModal({
			title: '收回叫号',
			content: '收回后记录回到待叫号，需重新叫号。确定收回？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/storage_recall', { id }, { title: '处理中' });
					wx.showToast({ title: '已收回叫号', icon: 'success' });
					that._afterChange(id);
				} catch (err) {
					console.log(err);
				}
			}
		});
	},

	// ========== 手动派单 ==========

	bindAssignTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this._assign(item);
	},

	bindDetailAssignTap: function () {
		if (!this.data.selectedItem) return;
		this._assign(this.data.selectedItem);
	},

	_assign: async function (item) {
		try {
			let rawList = await cloudHelper.callCloudData('admin/storage_forklift_list', {}, { title: '', hint: false });
			if (!rawList || !rawList.length) {
				wx.showToast({ title: '暂无可用吊柜司机，请先添加叉车账号', icon: 'none' });
				return;
			}
			this.setData({
				showAssignModal: true,
				assignTarget: item,
				assignForkliftList: rawList,
				assignIndex: 0,
			});
		} catch (err) {
			console.log(err);
		}
	},

	bindCloseAssignModal: function () {
		this.setData({ showAssignModal: false, assignTarget: null });
	},

	bindAssignChange: function (e) {
		this.setData({ assignIndex: Number(e.detail.value) });
	},

	bindConfirmAssign: async function () {
		if (this.data.assignLoading) return;
		let target = this.data.assignTarget;
		let forklift = this.data.assignForkliftList[this.data.assignIndex];
		if (!target || !forklift) return;

		this.setData({ assignLoading: true });
		try {
			await cloudHelper.callCloudSumbit('admin/storage_assign', {
				id: target._id,
				forkliftId: forklift._id,
			}, { title: '派单中' });
			wx.showToast({ title: '已派单给 ' + forklift.USER_NAME, icon: 'none' });
			this.setData({ showAssignModal: false, assignTarget: null });
			this._afterChange(target._id);
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ assignLoading: false });
		}
	},

	// ========== 现场收款确认 ==========

	bindConfirmPayTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this._confirmPay(item);
	},

	bindDetailConfirmPayTap: function () {
		if (!this.data.selectedItem) return;
		this._confirmPay(this.data.selectedItem);
	},

	_confirmPay: function (item) {
		let that = this;
		wx.showModal({
			title: '确认收款',
			content: '取柜费用 ¥' + item.feeTotalText + '（' + item.STORAGE_DAYS + ' 天）。确认已收到司机现场缴费？确认后进入取柜排队。',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ submitting: true });
				try {
					let ret = await cloudHelper.callCloudSumbit('admin/storage_confirm_pay', {
						id: item._id,
					}, { title: '确认中' });
					wx.showToast({ title: '已确认收款', icon: 'success' });
					if (ret && ret.data) that._showDetail(ret.data);
					that.loadList();
				} catch (err) {
					console.log(err);
				} finally {
					that.setData({ submitting: false });
				}
			}
		});
	},

	// ========== 详情弹窗 ==========

	bindItemTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		await this._loadDetail(id);
	},

	_loadDetail: async function (id) {
		if (!id) return;
		try {
			let item = await cloudHelper.callCloudData('admin/storage_detail', { id }, { title: '加载中' });
			if (!item) return;
			this._showDetail(item);
		} catch (e) {
			console.log(e);
		}
	},

	_showDetail: function (item) {
		this.setData({
			showDetail: true,
			selectedItem: item,
			cancelReason: '',
		});
	},

	bindCloseDetailTap: function () {
		this.setData({
			showDetail: false,
			selectedItem: null,
			cancelReason: '',
		});
	},

	bindNoop: function () {},

	/** 操作后刷新：详情打开则刷新详情，否则刷新列表 */
	_afterChange: function (id) {
		if (this.data.showDetail && this.data.selectedItem && this.data.selectedItem._id === id) {
			this._loadDetail(id);
		}
		this.loadList();
	},

	// ========== 详情-取消 ==========

	bindCancelReasonInput: function (e) {
		this.setData({ cancelReason: e.detail.value });
	},

	bindCancelTap: function () {
		if (this.data.submitting || !this.data.selectedItem) return;

		let reason = this.data.cancelReason.trim();
		if (!reason) return wx.showToast({ title: '请输入取消原因', icon: 'none' });

		let that = this;
		wx.showModal({
			title: '确认取消',
			content: '取消后该记录从看板移除。确定继续？',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ submitting: true });
				try {
					await cloudHelper.callCloudSumbit('admin/storage_cancel', {
						id: that.data.selectedItem._id,
						reason,
					}, { title: '取消中' });
					wx.showToast({ title: '已取消', icon: 'success' });
					that.bindCloseDetailTap();
					that.loadList();
				} catch (e) {
					console.log(e);
				} finally {
					that.setData({ submitting: false });
				}
			}
		});
	},

	// ========== 凭证预览 / 保存到相册 ==========

	bindPreviewProofTap: function (e) {
		let field = e.currentTarget.dataset.field;
		let proof = this.data.selectedItem && this.data.selectedItem[field];
		if (!proof) return;
		cloudHelper.previewCloudImage(proof);
	},

	bindSaveProofTap: function (e) {
		let field = e.currentTarget.dataset.field;
		let proof = this.data.selectedItem && this.data.selectedItem[field];
		if (proof) this._saveCloudImage(proof);
	},

	/** 司机注册信息三证预览（field: driverLicenseImg/vehicleRegImg/idCardImg） */
	bindPreviewDriverImgTap: function (e) {
		let field = e.currentTarget.dataset.field;
		let info = this.data.selectedItem && this.data.selectedItem.driverInfo;
		if (!info || !info[field]) return;
		cloudHelper.previewCloudImage(info[field]);
	},

	/** 云存储图片保存到相册 */
	_saveCloudImage: async function (fileID) {
		wx.showLoading({ title: '保存中', mask: true });
		try {
			let url = await cloudHelper.getTempUrl(fileID);
			if (!url) throw new Error('获取图片失败');
			let download = await new Promise((resolve, reject) => {
				wx.downloadFile({ url, success: resolve, fail: reject });
			});
			if (download.statusCode !== 200) throw new Error('下载失败');
			await new Promise((resolve, reject) => {
				wx.saveImageToPhotosAlbum({ filePath: download.tempFilePath, success: resolve, fail: reject });
			});
			wx.showToast({ title: '已保存到相册', icon: 'success' });
		} catch (err) {
			console.log(err);
			if (err && err.errMsg && err.errMsg.indexOf('auth') > -1) {
				wx.showModal({
					title: '需要相册权限',
					content: '请在设置中允许使用相册权限后重试',
					confirmText: '去设置',
					success: res => {
						if (res.confirm) wx.openSetting();
					}
				});
			} else {
				wx.showToast({ title: '保存失败，请重试', icon: 'none' });
			}
		} finally {
			wx.hideLoading();
		}
	},

	// ========== 柜型管理 ==========

	bindOpenCabinetTap: async function () {
		this.setData({ showCabinetModal: true, cabinetEdit: false });
		await this._loadCabinets();
	},

	bindCloseCabinetTap: function () {
		this.setData({ showCabinetModal: false, cabinetEdit: false });
	},

	_loadCabinets: async function () {
		if (this.data.cabinetLoading) return;
		this.setData({ cabinetLoading: true });
		try {
			let data = await cloudHelper.callCloudData('admin/storage_cabinet_list', {}, { title: '', hint: false });
			this.setData({ cabinets: (data && data.list) || [] });
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ cabinetLoading: false });
		}
	},

	/** 打开新增表单 */
	bindCabinetAddTap: function () {
		this.setData({
			cabinetEdit: true,
			cabinetForm: { id: '', name: '', priceDailyYuan: '', statusIndex: 0, order: '' },
		});
	},

	/** 打开编辑表单 */
	bindCabinetEditTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.cabinets.find(v => v._id === id);
		if (!item) return;
		this.setData({
			cabinetEdit: true,
			cabinetForm: {
				id: item._id,
				name: item.name,
				priceDailyYuan: this._yuan(item.priceDaily),
				statusIndex: item.status === 9 ? 1 : 0,
				order: String(item.order),
			},
		});
	},

	bindCabinetFormBackTap: function () {
		this.setData({ cabinetEdit: false });
		this._loadCabinets();
	},

	bindCabinetNameInput: function (e) {
		this.setData({ 'cabinetForm.name': e.detail.value });
	},

	bindCabinetPriceInput: function (e) {
		this.setData({ 'cabinetForm.priceDailyYuan': e.detail.value });
	},

	bindCabinetStatusChange: function (e) {
		this.setData({ 'cabinetForm.statusIndex': Number(e.detail.value) });
	},

	bindCabinetOrderInput: function (e) {
		this.setData({ 'cabinetForm.order': e.detail.value });
	},

	_yuan: function (fen) {
		return String(Math.round(Number(fen) || 0) / 100);
	},

	_fen: function (yuan) {
		let n = Number(yuan);
		if (!Number.isFinite(n) || n < 0) return -1;
		return Math.round(n * 100);
	},

	bindCabinetSaveTap: async function () {
		if (this.data.cabinetSaveLoading) return;
		let form = this.data.cabinetForm;
		let name = (form.name || '').trim();
		if (!name) return wx.showToast({ title: '请输入柜型名称', icon: 'none' });

		let priceDaily = this._fen(form.priceDailyYuan);
		if (priceDaily < 0) return wx.showToast({ title: '请输入正确的每日单价', icon: 'none' });

		let statusOption = this.data.cabinetStatusOptions[form.statusIndex];
		let order = Number(form.order);
		if (!Number.isInteger(order)) order = 9999;

		this.setData({ cabinetSaveLoading: true });
		try {
			await cloudHelper.callCloudSumbit('admin/storage_cabinet_save', {
				id: form.id,
				name,
				priceDaily,
				status: statusOption.value,
				order,
			}, { title: '保存中' });
			wx.showToast({ title: '已保存', icon: 'success' });
			this.setData({ cabinetEdit: false });
			this._loadCabinets();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ cabinetSaveLoading: false });
		}
	},

	bindCabinetDelTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.cabinets.find(v => v._id === id);
		if (!item) return;

		let that = this;
		wx.showModal({
			title: '删除柜型',
			content: '删除「' + item.name + '」后不可恢复。有进行中的存取柜记录引用时将被拒绝，建议改用禁用。确定删除？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/storage_cabinet_del', { id }, { title: '删除中' });
					wx.showToast({ title: '已删除', icon: 'success' });
					that._loadCabinets();
				} catch (err) {
					console.log(err);
				}
			}
		});
	},

	// ========== 导航 ==========

	bindHistoryTap: function () {
		wx.navigateTo({ url: '/pages/admin/storage_history' });
	},

	bindRefreshTap: function () {
		this.loadList();
	},

	// 底部工作区切换（当前页高亮，无操作）
	bindNavQueueTap: function () {
		wx.redirectTo({ url: '/admin/queue' });
	},

	bindNavStorageTap: function () {},

	bindNavAdminTap: function () {
		wx.redirectTo({ url: '/pages/admin/index/home/admin_home' });
	},
});
