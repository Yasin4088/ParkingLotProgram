/**
 * Notes: 停车场装卸排队业务（任务制 + 叉车抢单 + 费用结算）
 */

const BaseService = require('./base_service.js');
const QueueModel = require('../model/queue_model.js');
const UserModel = require('../model/user_model.js');
const config = require('../../config/config.js');
const timeUtil = require('../../framework/utils/time_util.js');
const miniLib = require('../../framework/lib/mini_lib.js');

const DEFAULT_LOT = { id: 'A', name: '装卸堆场', address: '园区装卸区' };

const ACTIONS = {
	load: '装货',
	unload: '卸货'
};

// 司机进行中的状态（认领后到离场前）
const ACTIVE_STATUS = [
	QueueModel.STATUS.BOOKED,
	QueueModel.STATUS.WAITING,
	QueueModel.STATUS.CALLED,
	QueueModel.STATUS.EXECUTING,
	QueueModel.STATUS.FINISHED,
	QueueModel.STATUS.TO_PAY
];

// 管理员看板展示的状态
const BOARD_STATUS = [
	QueueModel.STATUS.CLAIM_PENDING,
	QueueModel.STATUS.BOOKED,
	QueueModel.STATUS.WAITING,
	QueueModel.STATUS.CALLED,
	QueueModel.STATUS.EXECUTING,
	QueueModel.STATUS.FINISHED,
	QueueModel.STATUS.TO_PAY
];

class QueueService extends BaseService {

	getOptions() {
		return {
			lots: [DEFAULT_LOT],
			actions: Object.keys(ACTIONS).map(key => ({ id: key, name: ACTIONS[key] }))
		};
	}

	/** 管理员创建任务（待认领） */
	async createTask(plate, action, cargoName, phone, fees, remark) {
		if (!ACTIONS[action]) this.AppError('请选择装货或卸货');

		plate = (plate || '').trim().toUpperCase();
		if (!plate) this.AppError('请输入车牌号');
		phone = (phone || '').trim();
		if (!phone) this.AppError('请输入司机手机号');

		fees = this._checkEstimateFees(fees);

		return await QueueModel.insert({
			QUEUE_USER_ID: '',
			QUEUE_OPENID: '',
			QUEUE_PHONE: phone,
			QUEUE_PLATE: plate,
			QUEUE_LOT_ID: DEFAULT_LOT.id,
			QUEUE_LOT_NAME: DEFAULT_LOT.name,
			QUEUE_ACTION: action,
			QUEUE_ACTION_NAME: ACTIONS[action],
			QUEUE_CARGO_NAME: cargoName || '',
			QUEUE_REMARK: (remark || '').trim(),
			QUEUE_CREATE_TYPE: 0,
			QUEUE_FEES: fees,
			QUEUE_FEE_TOTAL: this._sumFees(fees),
			QUEUE_FORKLIFT_ID: '',
			QUEUE_FORKLIFT_NAME: '',
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_SUBSCRIBE: 0,
		});
	}

	/** 司机认领任务（车牌匹配待认领任务） */
	async claimTask(userId, openId, plate, phone, proof) {
		let active = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, 'QUEUE_ID,QUEUE_STATUS');
		if (active) this.AppError('您已有未完成的预约或排队记录，请完成后再提交');

		plate = (plate || '').trim().toUpperCase();
		let task = await QueueModel.getOne({
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_PLATE: plate
		}, '*', { QUEUE_ADD_TIME: 'asc' });
		if (!task) this.AppError('未找到与车牌匹配的待认领任务，请联系管理员创建');

		let updated = await QueueModel.edit({
			_id: task._id,
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING
		}, {
			QUEUE_USER_ID: userId,
			QUEUE_OPENID: openId,
			QUEUE_PHONE: phone,
			QUEUE_PROOF: proof || '',
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
		});
		if (!updated) this.AppError('手慢了，该任务已被认领');

		return await this.detail(task._id);
	}

	async myCurrent(userId) {
		let item = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, '*', { QUEUE_ADD_TIME: 'desc' });

		let ret = { item: null, lastDone: null };
		if (item) {
			let ahead = 0;
			if (item.QUEUE_STATUS === QueueModel.STATUS.WAITING) {
				ahead = await QueueModel.count({
					QUEUE_STATUS: QueueModel.STATUS.WAITING,
					QUEUE_CHECKIN_TIME: ['<', item.QUEUE_CHECKIN_TIME]
				});
			}
			ret.item = this._formatQueueItem(item, ahead);
		} else {
			// 无进行中记录时，附带最近一条历史记录（只读展示）
			let last = await QueueModel.getOne({
				QUEUE_USER_ID: userId,
				QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
			}, '*', { QUEUE_ADD_TIME: 'desc' });
			ret.lastDone = last ? this._formatQueueItem(last) : null;
		}

		return ret;
	}

	async checkin(userId, id, lat, lng) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.BOOKED
		});
		if (!item) this.AppError('未找到可签到的预约记录');

		let now = timeUtil.time();
		let queueNo = await this._makeQueueNo(now);
		await QueueModel.edit(item._id, {
			QUEUE_NO: queueNo,
			QUEUE_STATUS: QueueModel.STATUS.WAITING,
			QUEUE_CHECKIN_LAT: Number(lat) || 0,
			QUEUE_CHECKIN_LNG: Number(lng) || 0,
			QUEUE_CHECKIN_TIME: now,
		});

		return await this.myCurrent(userId);
	}

	async subscribe(userId, id) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, '_id');
		if (!item) this.AppError('未找到排队记录');

		await QueueModel.edit(item._id, { QUEUE_SUBSCRIBE: 1 });
	}

	/** 管理员叫号（任务进入叉车抢单池） */
	async callDriver(queueId) {
		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.WAITING
		}, {
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_CALL_TIME: now,
			QUEUE_DRIVER_CONFIRMED: 0,
		});
		if (!updated) this.AppError('仅可叫号排队中的车辆');

		return await this.detail(queueId);
	}

	/** 管理员收回叫号（叉车未接单时回退排队） */
	async recallCall(queueId) {
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, {
			QUEUE_STATUS: QueueModel.STATUS.WAITING,
			QUEUE_CALL_TIME: 0,
			QUEUE_DRIVER_CONFIRMED: 0,
		});
		if (!updated) this.AppError('仅可收回叉车尚未接单的叫号');

		return await this.detail(queueId);
	}

	/** 司机确认收到叫号（与叉车抢单并行，仅设标记位） */
	async driverConfirm(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		});
		if (!item) this.AppError('未找到待确认的叫号记录');

		await QueueModel.edit(item._id, {
			QUEUE_DRIVER_CONFIRMED: 1,
		});

		return await this._tryExecuting(queueId);
	}

	/** 检查是否可以进入执行中：司机已确认 + 叉车已接单 */
	async _tryExecuting(queueId) {
		let item = await QueueModel.getOne({ _id: queueId });
		if (!item) return null;

		if (item.QUEUE_STATUS !== QueueModel.STATUS.CALLED) {
			return this._formatQueueItem(item);
		}

		if (item.QUEUE_DRIVER_CONFIRMED === 1 && item.QUEUE_FORKLIFT_ID) {
			let now = timeUtil.time();
			let updated = await QueueModel.edit({
				_id: queueId,
				QUEUE_STATUS: QueueModel.STATUS.CALLED,
				QUEUE_DRIVER_CONFIRMED: 1,
				QUEUE_FORKLIFT_ID: item.QUEUE_FORKLIFT_ID
			}, {
				QUEUE_STATUS: QueueModel.STATUS.EXECUTING,
				QUEUE_CONFIRM_TIME: now,
			});
			if (updated) {
				item.QUEUE_STATUS = QueueModel.STATUS.EXECUTING;
				item.QUEUE_CONFIRM_TIME = now;
			}
		}

		return this._formatQueueItem(item);
	}

	/** 管理员手动派单（抢单兜底） */
	async manualAssign(queueId, forkliftId) {
		let forklift = await UserModel.getOne({
			_id: forkliftId,
			USER_ROLE: 'forklift',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME');
		if (!forklift) this.AppError('叉车司机不存在或已禁用');

		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, {
			QUEUE_FORKLIFT_ID: forkliftId,
			QUEUE_FORKLIFT_NAME: forklift.USER_NAME,
			QUEUE_FORKLIFT_GRAB_TIME: now,
			QUEUE_FORKLIFT_GRAB_TYPE: QueueModel.GRAB_TYPE.ASSIGN,
		});
		if (!updated) this.AppError('该任务已被叉车司机抢单');

		return await this._tryExecuting(queueId);
	}

	/** 管理员整体保存现场费用（执行中/待结算/待支付，支付前均可修改） */
	async saveSceneFees(queueId, fees) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.EXECUTING, QueueModel.STATUS.FINISHED, QueueModel.STATUS.TO_PAY]]
		});
		if (!item) this.AppError('仅可对执行中/待结算/待支付的记录修改费用');

		let list = Array.isArray(fees) ? fees : [];
		let clean = [];
		for (let f of list) {
			let name = (f.name || '').trim();
			if (!name) this.AppError('费用名称不能为空');
			if (name.length > 20) this.AppError('费用名称过长');
			let amount = Number(f.amount);
			if (!Number.isInteger(amount) || amount <= 0) this.AppError('费用金额需为大于0的整数（分）');
			clean.push({
				name,
				amount,
				type: QueueModel.FEE_TYPE.SCENE
			});
		}

		let total = this._sumFees(clean);
		let editData = {
			QUEUE_FEES: clean,
			QUEUE_FEE_TOTAL: total,
		};
		if (item.QUEUE_STATUS === QueueModel.STATUS.TO_PAY && total === 0) {
			// 待支付改零费用：回退待结算，重新走结算流程（免支付完成）
			editData.QUEUE_STATUS = QueueModel.STATUS.FINISHED;
			editData.QUEUE_SETTLE_TIME = 0;
		}

		await QueueModel.edit(item._id, editData);

		return await this.detail(queueId);
	}

	/** 管理员结算：总费用>0 → 待支付；=0 → 免支付直接完成 */
	async settle(queueId, operator = '管理员') {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.FINISHED
		});
		if (!item) this.AppError('仅可结算作业完成的记录');

		let now = timeUtil.time();
		let total = this._sumFees(item.QUEUE_FEES || []);
		if (total > 0) {
			await QueueModel.edit(item._id, {
				QUEUE_FEE_TOTAL: total,
				QUEUE_STATUS: QueueModel.STATUS.TO_PAY,
				QUEUE_SETTLE_TIME: now,
				QUEUE_SETTLE_OPERATOR: operator,
			});
		} else {
			await QueueModel.edit(item._id, {
				QUEUE_FEE_TOTAL: 0,
				QUEUE_STATUS: QueueModel.STATUS.DONE,
				QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.FREE,
				QUEUE_SETTLE_TIME: now,
				QUEUE_SETTLE_OPERATOR: operator,
				QUEUE_DONE_TIME: now,
			});
		}

		return await this.detail(queueId);
	}

	/** 管理员兜底完成（叉车无法操作时） */
	async finish(queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.EXECUTING
		});
		if (!item) this.AppError('仅可完成执行中的记录');

		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.FINISHED,
			QUEUE_FINISH_TIME: timeUtil.time(),
		});
	}

	/** 管理员列表（单一堆场，无需按停车场筛选） */
	async list() {
		await this.cancelExpired();

		let where = {
			QUEUE_STATUS: ['in', BOARD_STATUS]
		};

		let list = await QueueModel.getAll(where, '*', {
			QUEUE_STATUS: 'asc',
			QUEUE_CHECKIN_TIME: 'asc',
			QUEUE_ADD_TIME: 'asc'
		}, 200);

		return {
			lots: [DEFAULT_LOT],
			list: list.map(item => this._formatQueueItem(item))
		};
	}

	/** 管理员历史记录（已完成/已取消，可按月筛选） */
	async historyList(yearMonth) {
		let list = await QueueModel.getAll({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
		}, '*', { QUEUE_ADD_TIME: 'desc' }, 500);

		list = (list || []).map(item => this._formatQueueItem(item));

		if (yearMonth) {
			let range = this._getMonthRange(yearMonth);
			list = list.filter(item => {
				let t = this._getHistoryTime(item);
				return t >= range.start && t < range.end;
			});
		}

		list.sort((a, b) => (this._getHistoryTime(b) - this._getHistoryTime(a)));

		return {
			total: list.length,
			list
		};
	}

	/** 管理员清理单条历史记录 */
	async clearHistory(id) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
		}, '_id');
		if (!item) this.AppError('未找到可清理的历史记录');

		await QueueModel.del(item._id);
	}

	/** 管理员清空全部历史记录 */
	async clearAllHistory() {
		await QueueModel.del({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
		});
	}

	/** 清理过期记录：7天未认领的任务 + 24h未签到的预约 */
	async cancelExpired() {
		let now = timeUtil.time();

		// 7 天未认领的任务
		let expiredClaim = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_ADD_TIME: ['<', now - 7 * 24 * 60 * 60 * 1000]
		}, '_id', { QUEUE_ADD_TIME: 'asc' }, 200);

		for (let item of expiredClaim) {
			await QueueModel.edit(item._id, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '超过7天未认领，任务已自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		// 24h 未签到的预约（以认领时间为准）
		let expiredBooked = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
			QUEUE_EDIT_TIME: ['<', now - 24 * 60 * 60 * 1000]
		}, '_id', { QUEUE_EDIT_TIME: 'asc' }, 200);

		for (let item of expiredBooked) {
			await QueueModel.edit(item._id, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '超过一天未签到，预约已自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		return expiredClaim.length + expiredBooked.length;
	}

	async detail(id) {
		let item = await QueueModel.getOne({ _id: id });
		if (!item) this.AppError('未找到排队记录');
		return this._formatQueueItem(item);
	}

	async edit(id, data) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CLAIM_PENDING, QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		});
		if (!item) this.AppError('仅可编辑当前流程中的记录');

		let editData = {};
		if (item.QUEUE_STATUS === QueueModel.STATUS.CALLED) {
			// 已叫号：仅可修改预估费用
			let fees = this._checkEstimateFees(data.fees);
			editData.QUEUE_FEES = fees;
			editData.QUEUE_FEE_TOTAL = this._sumFees(fees);
		} else {
			// 待认领/已预约/排队中：可改基本信息与预估费用
			if (!ACTIONS[data.action]) this.AppError('请选择装货或卸货');
			let phone = (data.phone || '').trim();
			let plate = (data.plate || '').trim().toUpperCase();
			if (!plate) this.AppError('请输入车牌号');
			if (!phone) this.AppError('请输入手机号');

			editData = {
				QUEUE_PHONE: phone,
				QUEUE_PLATE: plate,
				QUEUE_ACTION: data.action,
				QUEUE_ACTION_NAME: ACTIONS[data.action],
				QUEUE_CARGO_NAME: data.cargoName || '',
				QUEUE_REMARK: (data.remark || '').trim(),
			};
			if (data.fees !== undefined && data.fees !== null) {
				let fees = this._checkEstimateFees(data.fees);
				editData.QUEUE_FEES = fees;
				editData.QUEUE_FEE_TOTAL = this._sumFees(fees);
			}
		}

		await QueueModel.edit(item._id, editData);

		return await this.detail(id);
	}

	async cancel(id, reason, operator = '管理员') {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CLAIM_PENDING, QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		});
		if (!item) this.AppError('仅可取消未开始执行的任务');

		reason = (reason || '').trim();
		if (!reason) this.AppError('请输入取消原因');

		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.CANCEL,
			QUEUE_CANCEL_TIME: timeUtil.time(),
			QUEUE_CANCEL_REASON: reason,
			QUEUE_CANCEL_OPERATOR: operator
		});

		await this._sendCancelNotice(item, reason);
	}

	/** 获取可用叉车司机列表 */
	async getForkliftList() {
		let list = await UserModel.getAll({
			USER_ROLE: 'forklift',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME', { USER_NAME: 'asc' }, 200);
		return (list || []).map(u => ({ _id: u._id, USER_NAME: u.USER_NAME }));
	}

	async _sendCancelNotice(item, reason) {
		if (!config.QUEUE_CANCEL_TEMPLATE_ID || !item.QUEUE_OPENID) return;

		await miniLib.sendMiniOnceTempMsg({
			touser: item.QUEUE_OPENID,
			template_id: config.QUEUE_CANCEL_TEMPLATE_ID,
			page: '/driver/home',
			data: {
				thing1: { value: miniLib.fmtThing('预约已取消，请重新预约') },
				thing2: { value: miniLib.fmtThing(reason) },
				thing3: { value: miniLib.fmtThing(item.QUEUE_PLATE || '') },
				thing4: { value: miniLib.fmtThing(item.QUEUE_LOT_NAME || '') },
			}
		}, 'queue_cancel');
	}

	async _makeQueueNo(now) {
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');
		let cnt = await QueueModel.count({
			QUEUE_CHECKIN_TIME: ['>=', timeUtil.time2Timestamp(day + ' 00:00:00')]
		});
		return String(cnt + 1).padStart(3, '0');
	}

	/** 校验预估费用条目并转为标准结构 */
	_checkEstimateFees(fees) {
		let list = Array.isArray(fees) ? fees : [];
		for (let f of list) {
			f.name = (f.name || '').trim();
			if (!f.name) this.AppError('费用名称不能为空');
			if (f.name.length > 20) this.AppError('费用名称过长');
			let amount = Number(f.amount);
			if (!Number.isInteger(amount) || amount <= 0) this.AppError('费用金额需为大于0的整数（分）');
		}
		return list.map(f => ({
			name: f.name,
			amount: Number(f.amount),
			type: QueueModel.FEE_TYPE.ESTIMATE
		}));
	}

	_sumFees(fees) {
		return (fees || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
	}

	_fmtMoney(amount) {
		return (Number(amount || 0) / 100).toFixed(2);
	}

	_formatQueueItem(item, ahead = 0) {
		if (!item) return null;

		item.statusDesc = QueueModel.getDesc('STATUS', item.QUEUE_STATUS);
		item.ahead = ahead;
		item.checkinTimeText = item.QUEUE_CHECKIN_TIME ? timeUtil.timestamp2Time(item.QUEUE_CHECKIN_TIME) : '';
		item.callTimeText = item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '';
		item.confirmTimeText = item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '';
		item.finishTimeText = item.QUEUE_FINISH_TIME ? timeUtil.timestamp2Time(item.QUEUE_FINISH_TIME) : '';
		item.settleTimeText = item.QUEUE_SETTLE_TIME ? timeUtil.timestamp2Time(item.QUEUE_SETTLE_TIME) : '';
		item.payTimeText = item.QUEUE_PAY_TIME ? timeUtil.timestamp2Time(item.QUEUE_PAY_TIME) : '';
		item.doneTimeText = item.QUEUE_DONE_TIME ? timeUtil.timestamp2Time(item.QUEUE_DONE_TIME) : '';
		item.cancelTimeText = item.QUEUE_CANCEL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CANCEL_TIME) : '';
		item.addTimeText = item.QUEUE_ADD_TIME ? timeUtil.timestamp2Time(item.QUEUE_ADD_TIME) : '';

		// 叉车信息
		item.driverConfirmed = item.QUEUE_DRIVER_CONFIRMED === 1;
		item.forkliftName = item.QUEUE_FORKLIFT_NAME || '';
		item.grabTypeDesc = item.QUEUE_FORKLIFT_ID ? QueueModel.getDesc('GRAB_TYPE', item.QUEUE_FORKLIFT_GRAB_TYPE) : '';

		// 费用明细
		item.fees = (item.QUEUE_FEES || []).map(f => {
			return {
				name: f.name || '',
				amount: Number(f.amount) || 0,
				amountText: this._fmtMoney(f.amount),
				type: f.type,
				typeDesc: QueueModel.getDesc('FEE_TYPE', f.type),
			};
		});
		item.feeTotal = Number(item.QUEUE_FEE_TOTAL) || this._sumFees(item.QUEUE_FEES);
		item.feeTotalText = this._fmtMoney(item.feeTotal);
		item.payStatusDesc = QueueModel.getDesc('PAY_STATUS', item.QUEUE_PAY_STATUS);

		return item;
	}

	_getHistoryTime(item) {
		return item.QUEUE_DONE_TIME || item.QUEUE_FINISH_TIME || item.QUEUE_CANCEL_TIME || item.QUEUE_EDIT_TIME || item.QUEUE_ADD_TIME || 0;
	}

	_getMonthRange(yearMonth) {
		let parts = (yearMonth || '').split('-');
		let year = Number(parts[0]);
		let month = Number(parts[1]);
		if (!year || !month) this.AppError('月份格式错误');

		let nextYear = month === 12 ? year + 1 : year;
		let nextMonth = month === 12 ? '01' : String(month + 1).padStart(2, '0');

		return {
			start: timeUtil.time2Timestamp(yearMonth + '-01 00:00:00'),
			end: timeUtil.time2Timestamp(nextYear + '-' + nextMonth + '-01 00:00:00')
		};
	}
}

module.exports = QueueService;
