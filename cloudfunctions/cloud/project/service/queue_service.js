/**
 * Notes: 停车场装卸排队业务
 */

const BaseService = require('./base_service.js');
const QueueModel = require('../model/queue_model.js');
const UserModel = require('../model/user_model.js');
const config = require('../../config/config.js');
const timeUtil = require('../../framework/utils/time_util.js');
const md5Lib = require('../../framework/lib/md5_lib.js');
const miniLib = require('../../framework/lib/mini_lib.js');

const DEFAULT_LOT = { id: 'A', name: '装卸堆场', address: '园区装卸区' };

const ACTIONS = {
	load: '装货',
	unload: '卸货'
};

class QueueService extends BaseService {

	getOptions() {
		return {
			lots: [DEFAULT_LOT],
			actions: Object.keys(ACTIONS).map(key => ({ id: key, name: ACTIONS[key] }))
		};
	}

	/** 司机预约（不选停车场，使用默认场地） */
	async create(userId, openId, action, plate, phone, proof, cargoName) {
		if (!ACTIONS[action]) this.AppError('请选择装货或卸货');

		let active = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, 'QUEUE_ID,QUEUE_STATUS');
		if (active) this.AppError('您已有未完成的预约或排队记录，请完成后再提交');

		return await QueueModel.insert({
			QUEUE_USER_ID: userId,
			QUEUE_OPENID: openId,
			QUEUE_PHONE: phone,
			QUEUE_PLATE: plate,
			QUEUE_LOT_ID: DEFAULT_LOT.id,
			QUEUE_LOT_NAME: DEFAULT_LOT.name,
			QUEUE_ACTION: action,
			QUEUE_ACTION_NAME: ACTIONS[action],
			QUEUE_PROOF: proof || '',
			QUEUE_CARGO_NAME: cargoName || '',
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
			QUEUE_SUBSCRIBE: 0,
		});
	}

	async myCurrent(userId) {
		let item = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, '*', { QUEUE_ADD_TIME: 'desc' });

		if (!item) return null;

		let ahead = 0;
		if (item.QUEUE_STATUS === QueueModel.STATUS.WAITING) {
			ahead = await QueueModel.count({
				QUEUE_STATUS: QueueModel.STATUS.WAITING,
				QUEUE_CHECKIN_TIME: ['<', item.QUEUE_CHECKIN_TIME]
			});
		}

		return this._formatQueueItem(item, ahead);
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
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, '_id');
		if (!item) this.AppError('未找到排队记录');

		await QueueModel.edit(item._id, { QUEUE_SUBSCRIBE: 1 });
	}

	/** 管理员叫号（任意选车） + 指派叉车司机 */
	async callDriver(queueId, forkliftId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.WAITING
		});
		if (!item) this.AppError('仅可叫号排队中的车辆');

		let forklift = await UserModel.getOne({
			_id: forkliftId,
			USER_ROLE: 'forklift',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME');
		if (!forklift) this.AppError('叉车司机不存在或已禁用');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_CALL_TIME: now,
			QUEUE_FORKLIFT_ID: forkliftId,
			QUEUE_FORKLIFT_NAME: forklift.USER_NAME,
			QUEUE_FORKLIFT_TIME: now,
		});

		return await QueueModel.getOne(item._id);
	}

	/** 司机确认收到叫号 */
	async driverConfirm(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		});
		if (!item) this.AppError('未找到待确认的叫号记录');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED,
			QUEUE_CONFIRM_TIME: now,
		});

		return await QueueModel.getOne(item._id);
	}

	/** 叉车司机完成任务 */
	async forkliftComplete(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		});
		if (!item) this.AppError('未找到待完成的任务');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_TIME: now,
		});

		return await QueueModel.getOne(item._id);
	}

	/** 司机上传完成凭证并完成作业 */
	async driverFinish(userId, queueId, finishProof) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		});
		if (!item) this.AppError('未找到可完成的作业记录');

		finishProof = (finishProof || '').trim();
		if (!finishProof) this.AppError('请先上传完成作业凭证');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_PROOF: finishProof,
			QUEUE_FINISH_TIME: now,
		});

		return await QueueModel.getOne(item._id);
	}

	/** 管理员手动完成 */
	async finish(queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		});
		if (!item) this.AppError('仅可完成司机已确认的记录');

		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_TIME: timeUtil.time(),
		});
	}

	/** 管理员列表（单一堆场，无需按停车场筛选） */
	async list() {
		await this.cancelExpired();

		let where = {
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		};

		let list = await QueueModel.getAll(where, '*', {
			QUEUE_STATUS: 'desc',
			QUEUE_CHECKIN_TIME: 'asc',
			QUEUE_ADD_TIME: 'asc'
		}, 200);

		return {
			lots: [DEFAULT_LOT],
			list: list.map(item => this._formatQueueItem(item))
		};
	}

	/** 管理员历史记录（已完成/已取消） */
	async historyList() {
		let list = await QueueModel.getAll({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
		}, '*', {
			QUEUE_EDIT_TIME: 'desc'
		}, 500);

		list = (list || []).map(item => this._formatQueueItem(item));
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

	/** 清理过期记录：24h未签到 + 5分钟未确认 */
	async cancelExpired() {
		let now = timeUtil.time();

		// 24h 未签到的预约
		let expiredBooked = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
			QUEUE_ADD_TIME: ['<', now - 24 * 60 * 60 * 1000]
		}, '_id', { QUEUE_ADD_TIME: 'asc' }, 200);

		for (let item of expiredBooked) {
			await QueueModel.edit(item._id, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '超过一天未签到，预约已自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		// 5 分钟未确认的叫号
		let expiredCalled = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_CALL_TIME: ['<', now - 5 * 60 * 1000]
		}, '*', { QUEUE_CALL_TIME: 'asc' }, 200);

		for (let item of expiredCalled) {
			await QueueModel.edit(item._id, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '司机超时未确认，自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		return expiredBooked.length + expiredCalled.length;
	}

	async detail(id) {
		let item = await QueueModel.getOne({ _id: id });
		if (!item) this.AppError('未找到排队记录');
		return this._formatQueueItem(item);
	}

	async edit(id, data) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		});
		if (!item) this.AppError('仅可编辑当前队列中的记录');

		if (!ACTIONS[data.action]) this.AppError('请选择装货或卸货');

		let phone = (data.phone || '').trim();
		let plate = (data.plate || '').trim();
		if (!plate) this.AppError('请输入车牌号');
		if (!phone) this.AppError('请输入手机号');

		await QueueModel.edit(item._id, {
			QUEUE_PHONE: phone,
			QUEUE_PLATE: plate,
			QUEUE_ACTION: data.action,
			QUEUE_ACTION_NAME: ACTIONS[data.action],
			QUEUE_CARGO_NAME: data.cargoName || '',
		});

		return await this.detail(id);
	}

	async cancel(id, reason, operator = '管理员') {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		});
		if (!item) this.AppError('仅可取消当前队列中的记录');

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

	async driverLogin(username, password) {
		let user = await UserModel.getOne({
			USER_NAME: username,
			USER_ROLE: 'driver'
		}, 'USER_NAME,USER_MOBILE,USER_PASSWORD,USER_STATUS,USER_LOGIN_CNT');

		if (!user) {
			this.AppError('用户名或密码不正确，请联系管理员创建账号');
		}

		if (user.USER_STATUS === UserModel.STATUS.FORBID) {
			this.AppError('您的账户已被禁用，请联系管理员');
		}

		let inputPwd = md5Lib.md5(password);
		if (inputPwd !== user.USER_PASSWORD) {
			this.AppError('用户名或密码不正确');
		}

		let cnt = (user.USER_LOGIN_CNT || 0) + 1;
		await UserModel.edit(user._id, {
			USER_LOGIN_CNT: cnt,
			USER_LOGIN_TIME: timeUtil.time()
		});

		return {
			id: user._id,
			token: user._id,
			name: user.USER_NAME,
			phone: user.USER_MOBILE || '',
			role: 'driver'
		};
	}

	async _makeQueueNo(now) {
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');
		let cnt = await QueueModel.count({
			QUEUE_CHECKIN_TIME: ['>=', timeUtil.time2Timestamp(day + ' 00:00:00')]
		});
		return String(cnt + 1).padStart(3, '0');
	}

	_formatQueueItem(item, ahead = 0) {
		if (!item) return null;
		item.statusDesc = QueueModel.STATUS_DESC[Object.keys(QueueModel.STATUS).find(key => QueueModel.STATUS[key] === item.QUEUE_STATUS)] || '';
		item.ahead = ahead;
		item.checkinTimeText = item.QUEUE_CHECKIN_TIME ? timeUtil.timestamp2Time(item.QUEUE_CHECKIN_TIME) : '';
		item.callTimeText = item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '';
		item.confirmTimeText = item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '';
		item.finishTimeText = item.QUEUE_FINISH_TIME ? timeUtil.timestamp2Time(item.QUEUE_FINISH_TIME) : '';
		item.cancelTimeText = item.QUEUE_CANCEL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CANCEL_TIME) : '';
		item.addTimeText = item.QUEUE_ADD_TIME ? timeUtil.timestamp2Time(item.QUEUE_ADD_TIME) : '';
		return item;
	}

	_getHistoryTime(item) {
		return item.QUEUE_FINISH_TIME || item.QUEUE_CANCEL_TIME || item.QUEUE_EDIT_TIME || item.QUEUE_ADD_TIME || 0;
	}
}

module.exports = QueueService;
