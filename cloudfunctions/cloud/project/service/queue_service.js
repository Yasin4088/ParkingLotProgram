/**
 * Notes: 停车场装卸排队业务
 */

const BaseService = require('./base_service.js');
const QueueModel = require('../model/queue_model.js');
const UserModel = require('../model/user_model.js');
const config = require('../../config/config.js');
const timeUtil = require('../../framework/utils/time_util.js');
const md5Lib = require('../../framework/lib/md5_lib.js');

const PARKING_LOTS = [
	{ id: 'A', name: '一号停车场', address: '园区东门装卸区' },
	{ id: 'B', name: '二号停车场', address: '园区西门装卸区' },
	{ id: 'C', name: '三号停车场', address: '仓库北侧临停区' },
];

const ACTIONS = {
	load: '装货',
	unload: '卸货'
};

class QueueService extends BaseService {

	getOptions() {
		return {
			lots: PARKING_LOTS,
			actions: Object.keys(ACTIONS).map(key => ({ id: key, name: ACTIONS[key] }))
		};
	}

	async create(userId, openId, lotId, action, plate, phone, proof) {
		let lot = this._getLot(lotId);
		if (!ACTIONS[action]) this.AppError('请选择装货或卸货');

		let active = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		}, 'QUEUE_ID,QUEUE_STATUS,QUEUE_LOT_NAME,QUEUE_ACTION_NAME');
		if (active) this.AppError('您已有未完成的预约或排队记录，请完成后再提交');

		await UserModel.edit(userId, {
			USER_MOBILE: phone,
			USER_NAME: phone || plate || '微信司机'
		});

		return await QueueModel.insert({
			QUEUE_USER_ID: userId,
			QUEUE_OPENID: openId,
			QUEUE_PHONE: phone,
			QUEUE_PLATE: plate,
			QUEUE_LOT_ID: lot.id,
			QUEUE_LOT_NAME: lot.name,
			QUEUE_ACTION: action,
			QUEUE_ACTION_NAME: ACTIONS[action],
			QUEUE_PROOF: proof || '',
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
			QUEUE_SUBSCRIBE: 0,
		});
	}

	async myCurrent(userId) {
		let item = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		}, '*', { QUEUE_ADD_TIME: 'desc' });

		if (!item) return null;

		let ahead = 0;
		if (item.QUEUE_STATUS === QueueModel.STATUS.WAITING) {
			ahead = await QueueModel.count({
				QUEUE_LOT_ID: item.QUEUE_LOT_ID,
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
		let queueNo = await this._makeQueueNo(item.QUEUE_LOT_ID, now);
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
			QUEUE_STATUS: ['in', [QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		}, '_id');
		if (!item) this.AppError('未找到排队记录');

		await QueueModel.edit(item._id, { QUEUE_SUBSCRIBE: 1 });
	}

	async list(lotId) {
		let where = {
			QUEUE_STATUS: ['in', [QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		};
		if (lotId) where.QUEUE_LOT_ID = lotId;

		let list = await QueueModel.getAll(where, '*', {
			QUEUE_STATUS: 'desc',
			QUEUE_CHECKIN_TIME: 'asc'
		}, 200);

		return {
			lots: PARKING_LOTS,
			list: list.map(item => this._formatQueueItem(item))
		};
	}

	async callNext(lotId) {
		this._getLot(lotId);

		let item = await QueueModel.getOne({
			QUEUE_LOT_ID: lotId,
			QUEUE_STATUS: QueueModel.STATUS.WAITING
		}, '*', { QUEUE_CHECKIN_TIME: 'asc' });
		if (!item) this.AppError('当前停车场暂无排队车辆');

		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_CALL_TIME: timeUtil.time()
		});

		return await QueueModel.getOne(item._id);
	}

	async finish(id) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		}, '_id');
		if (!item) this.AppError('仅已叫号车辆可以完成');

		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_TIME: timeUtil.time()
		});
	}

	_getLot(lotId) {
		let lot = PARKING_LOTS.find(item => item.id === lotId);
		if (!lot) this.AppError('请选择停车场');
		return lot;
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

	async _makeQueueNo(lotId, now) {
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');
		let cnt = await QueueModel.count({
			QUEUE_LOT_ID: lotId,
			QUEUE_CHECKIN_TIME: ['>=', timeUtil.time2Timestamp(day + ' 00:00:00')]
		});
		return lotId + String(cnt + 1).padStart(3, '0');
	}

	_formatQueueItem(item, ahead = 0) {
		if (!item) return null;
		item.statusDesc = QueueModel.STATUS_DESC[Object.keys(QueueModel.STATUS).find(key => QueueModel.STATUS[key] === item.QUEUE_STATUS)] || '';
		item.ahead = ahead;
		item.checkinTimeText = item.QUEUE_CHECKIN_TIME ? timeUtil.timestamp2Time(item.QUEUE_CHECKIN_TIME) : '';
		item.callTimeText = item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '';
		return item;
	}
}

module.exports = QueueService;
