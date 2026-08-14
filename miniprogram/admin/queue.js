const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

const ACTIONS = [
	{ id: 'load', name: '装货' },
	{ id: 'unload', name: '卸货' },
];

// 固定费用项（可另加自定义费用）
const FEE_ITEMS = ['办单费', '过磅费', '拆箱费', '吊机费', '存柜费'];

// 支付方式（与后端 QueueModel.PAY_MODE 一致）
const PAY_MODES = [
	{ id: 0, name: '现场支付' },
	{ id: 1, name: '客户记账' },
];

// 状态 → 卡片/徽标配色
const STATUS_CLASS = {
	0: 'st-pending',
	1: 'st-booked',
	2: 'st-waiting',
	3: 'st-called',
	4: 'st-executing',
	5: 'st-settling',
	6: 'st-topay',
};

// 状态统计条（文案与后端 STATUS_DESC 一致）
const STATUS_ITEMS = [
	{ status: 0, label: '待认领' },
	{ status: 1, label: '已预约' },
	{ status: 2, label: '排队中' },
	{ status: 3, label: '已叫号' },
	{ status: 4, label: '执行中' },
	{ status: 5, label: '待结算' },
	{ status: 6, label: '待支付' },
];

// 状态 → 用时起始时间戳字段
const ELAPSED_FIELD = {
	0: 'QUEUE_ADD_TIME',
	1: 'QUEUE_EDIT_TIME',
	2: 'QUEUE_CHECKIN_TIME',
	3: 'QUEUE_CALL_TIME',
	4: 'QUEUE_CONFIRM_TIME',
	5: 'QUEUE_FINISH_TIME',
	6: 'QUEUE_SETTLE_TIME',
};

Page({
	data: {
		actions: ACTIONS,
		list: [],
		displayList: [],
		stats: [],
		total: 0,
		filterStatus: '',
		loading: false,
		submitting: false,

		// 详情弹窗
		showDetail: false,
		editMode: false,
		selectedItem: null,
		editForm: {
			plate: '',
			phone: '',
			action: '',
			cargoName: '',
			remark: '',
		},
		editFees: [],
		actionEditIndex: 0,
		editPayModeIndex: 0,
		cancelReason: '',

		// 新建任务弹窗
		showCreate: false,
		createForm: {
			plate: '',
			phone: '',
			action: 'load',
			cargoName: '',
			remark: '',
		},
		createActionIndex: 0,
		createPayModeIndex: 0,
		payModes: PAY_MODES,
		createFees: [],
		createLoading: false,

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

		// 费用弹窗（全量编辑，支付前可改）
		showFeeModal: false,
		feeTarget: null,
		feeRows: [],
		feeLoading: false,
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
		return d.showDetail || d.showCreate || d.showCallModal || d.showAssignModal || d.showFeeModal;
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
			let data = await cloudHelper.callCloudData('admin/queue_list', {}, { title: '', hint: false });
			if (!data) return;
			let list = (data.list || []).map(item => {
				item.statusClass = STATUS_CLASS[item.QUEUE_STATUS] || 'st-booked';
				item.elapsedText = this._elapsedText(item);
				return item;
			});
			let stats = STATUS_ITEMS.map(s => ({ status: s.status, key: String(s.status), label: s.label, count: 0 }));
			let statMap = {};
			stats.forEach(s => statMap[s.status] = s);
			list.forEach(item => {
				if (statMap[item.QUEUE_STATUS]) statMap[item.QUEUE_STATUS].count++;
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
		let field = ELAPSED_FIELD[item.QUEUE_STATUS];
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
		return list.filter(item => String(item.QUEUE_STATUS) === s);
	},

	bindFilterTap: function (e) {
		let key = e.currentTarget.dataset.key;
		let next = (this.data.filterStatus === key) ? '' : key;
		this.setData({
			filterStatus: next,
			displayList: this._filterList(this.data.list, next),
		});
	},

	// ========== 金额工具（分 ↔ 元，仅 UI 层转换） ==========

	_yuan: function (fen) {
		return String(Math.round(Number(fen) || 0) / 100);
	},

	_fen: function (yuan) {
		let n = Number(yuan);
		if (!Number.isFinite(n) || n <= 0) return 0;
		return Math.round(n * 100);
	},

	/** 收集费用行 [{name, amountYuan}] → [{name, amount(分)}]，校验失败返回 null；金额留空或为 0 的项不计入 */
	_collectFees: function (fees) {
		let out = [];
		for (let f of fees) {
			let name = (f.name || '').trim();
			let yuan = String(f.amountYuan == null ? '' : f.amountYuan).trim();
			if (!yuan) continue; // 金额留空不计入
			let amount = this._fen(yuan);
			if (!amount) continue; // 金额为 0 不计入
			if (!name) {
				wx.showToast({ title: '请填写费用名称', icon: 'none' });
				return null;
			}
			out.push({ name, amount });
		}
		return out;
	},

	/** 由现有费用明细构建编辑行：5 个固定项在前（同名金额求和），自定义项按名分组在后 */
	_buildFeeRows: function (fees) {
		let sum = {};
		(fees || []).forEach(f => {
			let name = f.name || '';
			sum[name] = (sum[name] || 0) + (Number(f.amount) || 0);
		});
		let rows = FEE_ITEMS.map(name => ({
			name,
			fixed: true,
			amountYuan: sum[name] ? this._yuan(sum[name]) : '',
		}));
		Object.keys(sum).forEach(name => {
			if (FEE_ITEMS.indexOf(name) > -1) return;
			rows.push({ name, fixed: false, amountYuan: this._yuan(sum[name]) });
		});
		return rows;
	},

	/** 空费用行（新建任务用）：5 个固定项 */
	_emptyFeeRows: function () {
		return FEE_ITEMS.map(name => ({ name, fixed: true, amountYuan: '' }));
	},

	// ========== 新建任务 ==========

	bindOpenCreateTap: function () {
		this.setData({
			showCreate: true,
			createForm: { plate: '', phone: '', action: 'load', cargoName: '', remark: '' },
			createActionIndex: 0,
			createPayModeIndex: 0,
			createFees: this._emptyFeeRows(),
		});
	},

	bindCloseCreateTap: function () {
		this.setData({ showCreate: false });
	},

	bindCreatePlateInput: function (e) {
		this.setData({ 'createForm.plate': e.detail.value });
	},

	bindCreatePhoneInput: function (e) {
		this.setData({ 'createForm.phone': e.detail.value });
	},

	bindCreateCargoNameInput: function (e) {
		this.setData({ 'createForm.cargoName': e.detail.value });
	},

	bindCreateRemarkInput: function (e) {
		this.setData({ 'createForm.remark': e.detail.value });
	},

	bindCreateActionChange: function (e) {
		let index = Number(e.detail.value);
		let action = ACTIONS[index];
		this.setData({
			createActionIndex: index,
			'createForm.action': action ? action.id : '',
		});
	},

	bindCreatePayModeChange: function (e) {
		this.setData({ createPayModeIndex: Number(e.detail.value) });
	},

	bindCreateFeeNameInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['createFees[' + index + '].name']: e.detail.value });
	},

	bindCreateFeeAmountInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['createFees[' + index + '].amountYuan']: e.detail.value });
	},

	bindCreateFeeAddTap: function () {
		let createFees = this.data.createFees.concat([{ name: '', fixed: false, amountYuan: '' }]);
		this.setData({ createFees });
	},

	bindCreateFeeRemoveTap: function (e) {
		let index = e.currentTarget.dataset.index;
		let createFees = this.data.createFees.slice();
		createFees.splice(index, 1);
		this.setData({ createFees });
	},

	bindSubmitCreateTap: async function () {
		if (this.data.createLoading) return;

		let form = this.data.createForm;
		let plate = (form.plate || '').trim().toUpperCase();
		let phone = (form.phone || '').trim();
		if (!plate) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
		if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确的手机号', icon: 'none' });

		let fees = this._collectFees(this.data.createFees);
		if (fees === null) return;

		let payModeItem = PAY_MODES[this.data.createPayModeIndex];
		let payMode = payModeItem ? payModeItem.id : 0;

		this.setData({ createLoading: true });
		try {
			await cloudHelper.callCloudSumbit('admin/queue_create', {
				plate,
				phone,
				action: form.action,
				cargoName: (form.cargoName || '').trim(),
				remark: (form.remark || '').trim(),
				fees,
				payMode,
			}, { title: '创建中' });
			wx.showToast({ title: '任务已创建，等待司机认领', icon: 'none' });
			this.setData({ showCreate: false });
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ createLoading: false });
		}
	},

	// ========== 叫号 ==========

	bindCallTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this.setData({ showCallModal: true, callTarget: item });
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
			let res = await cloudHelper.callCloudSumbit('admin/queue_call', {
				id: target._id,
			}, { title: '叫号中' });

			let data = res && res.data ? res.data : res;
			wx.showModal({
				title: '叫号成功',
				content: '请 ' + (data.QUEUE_NO || '') + ' 号，车牌 ' + data.QUEUE_PLATE + ' 前往装卸区\n叉车司机将自行抢单',
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
			content: '收回后任务回到排队中，需重新叫号。确定收回？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/queue_recall', { id }, { title: '处理中' });
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
			let rawList = await cloudHelper.callCloudData('admin/forklift_list', {}, { title: '', hint: false });
			if (!rawList || !rawList.length) {
				wx.showToast({ title: '暂无可用叉车司机，请先添加', icon: 'none' });
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
			await cloudHelper.callCloudSumbit('admin/queue_assign', {
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

	// ========== 完成（管理员兜底） ==========

	bindFinishTap: function (e) {
		let id = e.currentTarget.dataset.id;
		this._finish(id);
	},

	bindDetailFinishTap: function () {
		if (!this.data.selectedItem) return;
		this._finish(this.data.selectedItem._id);
	},

	_finish: function (id) {
		let that = this;
		wx.showModal({
			title: '完成装卸',
			content: '管理员直接完成作业（叉车司机无法操作时使用）。确定完成？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/queue_finish', { id }, { title: '处理中' });
					wx.showToast({ title: '已标记完成', icon: 'success' });
					that._afterChange(id);
				} catch (err) {
					console.log(err);
				}
			}
		});
	},

	// ========== 费用编辑（支付前可改） ==========

	bindOpenFeeTap: function () {
		if (!this.data.selectedItem) return;
		this.setData({
			showFeeModal: true,
			feeTarget: this.data.selectedItem,
			feeRows: this._buildFeeRows(this.data.selectedItem.fees),
		});
	},

	/** 看板卡片直接改费用：先拉详情再开弹窗 */
	bindCardFeeTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		await this._loadDetail(id);
		this.bindOpenFeeTap();
	},

	bindCloseFeeTap: function () {
		this.setData({ showFeeModal: false, feeTarget: null, feeRows: [] });
	},

	bindFeeAmountInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['feeRows[' + index + '].amountYuan']: e.detail.value });
	},

	bindFeeNameInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['feeRows[' + index + '].name']: e.detail.value });
	},

	bindFeeAddTap: function () {
		let feeRows = this.data.feeRows.concat([{ name: '', fixed: false, amountYuan: '' }]);
		this.setData({ feeRows });
	},

	bindFeeRemoveTap: function (e) {
		let index = e.currentTarget.dataset.index;
		let feeRows = this.data.feeRows.slice();
		feeRows.splice(index, 1);
		this.setData({ feeRows });
	},

	bindConfirmFeeTap: async function () {
		if (this.data.feeLoading || !this.data.feeTarget) return;

		let fees = this._collectFees(this.data.feeRows);
		if (fees === null) return;

		this.setData({ feeLoading: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_fee_save', {
				id: this.data.feeTarget._id,
				fees,
			}, { title: '保存中' });
			wx.showToast({ title: '费用已保存', icon: 'success' });
			this.setData({ showFeeModal: false, feeTarget: null, feeRows: [] });
			if (res && res.data) this._showDetail(res.data);
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ feeLoading: false });
		}
	},

	// ========== 结算 ==========

	bindSettleTap: function () {
		if (this.data.submitting || !this.data.selectedItem) return;
		let item = this.data.selectedItem;
		let that = this;

		// 无费用：免支付直接完成
		if (Number(item.feeTotal) === 0) {
			this._settle(item, 0, '当前无费用，结算后任务直接完成（免支付）。确定结算？');
			return;
		}

		wx.showActionSheet({
			itemList: ['现场支付（司机支付后完成）', '客户记账（直接完成）'],
			success: res => {
				if (res.tapIndex === 0) {
					that._settle(item, 0, '合计费用 ¥' + item.feeTotalText + '。结算后费用锁定，司机支付完成后离场。确定结算？');
				} else if (res.tapIndex === 1) {
					wx.showModal({
						title: '客户记账',
						content: '合计费用 ¥' + item.feeTotalText + ' 记入客户账，结算后任务直接完成。请与客户确认后再继续。',
						success: modalRes => {
							if (!modalRes.confirm) return;
							that._settle(item, 1);
						}
					});
				}
			}
		});
	},

	/** 结算：payMode 0=现场支付 1=客户记账；confirmContent 为空则直接提交 */
	_settle: function (item, payMode, confirmContent) {
		let that = this;
		let doSettle = async () => {
			that.setData({ submitting: true });
			try {
				let ret = await cloudHelper.callCloudSumbit('admin/queue_settle', {
					id: item._id,
					payMode,
				}, { title: '结算中' });
				wx.showToast({ title: '已结算', icon: 'success' });
				if (ret && ret.data) that._showDetail(ret.data);
				that.loadList();
			} catch (err) {
				console.log(err);
			} finally {
				that.setData({ submitting: false });
			}
		};

		if (confirmContent) {
			wx.showModal({
				title: '确认结算',
				content: confirmContent,
				success: res => {
					if (res.confirm) doSettle();
				}
			});
		} else {
			doSettle();
		}
	},

	// ========== 详情弹窗 ==========

	bindItemTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		await this._loadDetail(id);
	},

	_loadDetail: async function (id) {
		if (!id) return;
		try {
			let item = await cloudHelper.callCloudData('admin/queue_detail', { id }, { title: '加载中' });
			if (!item) return;
			this._showDetail(item);
		} catch (e) {
			console.log(e);
		}
	},

	_showDetail: function (item) {
		let actionEditIndex = this.data.actions.findIndex(action => action.id === item.QUEUE_ACTION);
		let payModeIndex = PAY_MODES.findIndex(mode => mode.id === Number(item.payMode));
		this.setData({
			showDetail: true,
			editMode: false,
			selectedItem: item,
			editForm: {
				plate: item.QUEUE_PLATE || '',
				phone: item.QUEUE_PHONE || '',
				action: item.QUEUE_ACTION || ACTIONS[0].id,
				cargoName: item.QUEUE_CARGO_NAME || '',
				remark: item.QUEUE_REMARK || '',
			},
			editFees: [],
			actionEditIndex: actionEditIndex > -1 ? actionEditIndex : 0,
			editPayModeIndex: payModeIndex > -1 ? payModeIndex : 0,
			cancelReason: '',
		});
	},

	bindCloseDetailTap: function () {
		this.setData({
			showDetail: false,
			editMode: false,
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

	// ========== 详情-编辑 ==========

	bindEditTap: function () {
		let item = this.data.selectedItem;
		if (!item) return;
		this.setData({ editMode: true, editFees: this._buildFeeRows(item.fees) });
	},

	bindCancelEditTap: function () {
		if (!this.data.selectedItem) return;
		this._showDetail(this.data.selectedItem);
	},

	bindPlateInput: function (e) {
		this.setData({ 'editForm.plate': e.detail.value });
	},

	bindPhoneInput: function (e) {
		this.setData({ 'editForm.phone': e.detail.value });
	},

	bindCargoNameInput: function (e) {
		this.setData({ 'editForm.cargoName': e.detail.value });
	},

	bindRemarkInput: function (e) {
		this.setData({ 'editForm.remark': e.detail.value });
	},

	bindEditActionChange: function (e) {
		let index = Number(e.detail.value);
		let action = this.data.actions[index];
		this.setData({
			actionEditIndex: index,
			'editForm.action': action ? action.id : '',
		});
	},

	bindEditPayModeChange: function (e) {
		this.setData({ editPayModeIndex: Number(e.detail.value) });
	},

	bindEditFeeNameInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['editFees[' + index + '].name']: e.detail.value });
	},

	bindEditFeeAmountInput: function (e) {
		let index = e.currentTarget.dataset.index;
		this.setData({ ['editFees[' + index + '].amountYuan']: e.detail.value });
	},

	bindEditFeeAddTap: function () {
		let editFees = this.data.editFees.concat([{ name: '', fixed: false, amountYuan: '' }]);
		this.setData({ editFees });
	},

	bindEditFeeRemoveTap: function (e) {
		let index = e.currentTarget.dataset.index;
		let editFees = this.data.editFees.slice();
		editFees.splice(index, 1);
		this.setData({ editFees });
	},

	bindSaveEditTap: async function () {
		if (this.data.submitting || !this.data.selectedItem) return;

		let item = this.data.selectedItem;
		let fees = this._collectFees(this.data.editFees);
		if (fees === null) return;

		let form = this.data.editForm;
		let plate = (form.plate || '').trim().toUpperCase();
		let phone = (form.phone || '').trim();
		// 已叫号仅可改预估费用，基本信息传当前值
		if (item.QUEUE_STATUS !== 3) {
			if (!plate) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
			if (!phone) return wx.showToast({ title: '请输入手机号', icon: 'none' });
		}

		let payModeItem = PAY_MODES[this.data.editPayModeIndex];
		let payMode = payModeItem ? payModeItem.id : 0;

		this.setData({ submitting: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_edit', {
				id: item._id,
				plate: plate || item.QUEUE_PLATE,
				phone: phone || item.QUEUE_PHONE,
				action: form.action || item.QUEUE_ACTION,
				cargoName: (form.cargoName || '').trim(),
				remark: (form.remark || '').trim(),
				fees,
				payMode,
			}, { title: '保存中' });
			wx.showToast({ title: '已保存', icon: 'success' });
			if (res && res.data) this._showDetail(res.data);
			this.loadList();
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	// ========== 详情-取消 ==========

	bindCancelReasonInput: function (e) {
		this.setData({ cancelReason: e.detail.value });
	},

	bindCancelQueueTap: function () {
		if (this.data.submitting || !this.data.selectedItem) return;

		let reason = this.data.cancelReason.trim();
		if (!reason) return wx.showToast({ title: '请输入取消原因', icon: 'none' });

		let that = this;
		wx.showModal({
			title: '确认取消',
			content: '取消后该任务从看板移除。确定继续？',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ submitting: true });
				try {
					await cloudHelper.callCloudSumbit('admin/queue_cancel', {
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

	bindPreviewProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_PROOF;
		if (!proof) return;
		cloudHelper.previewCloudImage(proof);
	},

	bindPreviewFinishProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_FINISH_PROOF;
		if (!proof) return;
		cloudHelper.previewCloudImage(proof);
	},

	bindPreviewBillProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_FINISH_BILL_PROOF;
		if (!proof) return;
		cloudHelper.previewCloudImage(proof);
	},

	/** 司机注册信息三证预览（field: driverLicenseImg/vehicleRegImg/idCardImg） */
	bindPreviewDriverImgTap: function (e) {
		let field = e.currentTarget.dataset.field;
		let info = this.data.selectedItem && this.data.selectedItem.driverInfo;
		if (!info || !info[field]) return;
		cloudHelper.previewCloudImage(info[field]);
	},

	bindSaveProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_PROOF;
		if (proof) this._saveCloudImage(proof);
	},

	bindSaveFinishProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_FINISH_PROOF;
		if (proof) this._saveCloudImage(proof);
	},

	bindSaveBillProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_FINISH_BILL_PROOF;
		if (proof) this._saveCloudImage(proof);
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

	// ========== 导航 ==========

	bindRefreshTap: function () {
		this.loadList();
	},

	// 底部工作区切换（当前页高亮，无操作）
	bindNavQueueTap: function () {},

	bindNavStorageTap: function () {
		wx.redirectTo({ url: '/admin/storage' });
	},

	bindNavAdminTap: function () {
		wx.redirectTo({ url: '/pages/admin/index/home/admin_home' });
	},
});
