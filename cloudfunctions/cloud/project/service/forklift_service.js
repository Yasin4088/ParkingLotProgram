/**
 * Notes: 叉车司机业务
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const QueueModel = require('../model/queue_model.js');
const bcrypt = require('bcryptjs');
const timeUtil = require('../../framework/utils/time_util.js');

class ForkliftService extends BaseService {

	/** 叉车司机登录 */
	async login(username, password) {
		let user = await UserModel.getOne({
			USER_NAME: username,
			USER_ROLE: 'forklift'
		}, 'USER_NAME,USER_MOBILE,USER_PASSWORD,USER_STATUS,USER_LOGIN_CNT');

		if (!user) {
			this.AppError('用户名或密码不正确');
		}

		if (user.USER_STATUS === UserModel.STATUS.FORBID) {
			this.AppError('您的账户已被禁用，请联系管理员');
		}

		if (!bcrypt.compareSync(password, user.USER_PASSWORD)) {
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
			role: 'forklift'
		};
	}

	/** 获取叉车司机的当前任务（仅 CONFIRMED 状态） */
	async getMyTask(userId) {
		let item = await QueueModel.getOne({
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		}, '*', { QUEUE_CALL_TIME: 'desc' });

		if (!item) return null;

		return this._formatTaskItem(item);
	}

	/** 获取叉车司机的待处理任务列表（CALLED + CONFIRMED） */
	async getMyTasks(userId) {
		let list = await QueueModel.getAll({
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, '*', { QUEUE_CALL_TIME: 'desc' }, 50);

		return (list || []).map(item => this._formatTaskItem(item));
	}

	/** 叉车司机完成任务 */
	async completeTask(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		});
		if (!item) this.AppError('未找到待完成的任务（仅司机已确认的任务可完成）');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_TIME: now,
		});

		return { success: true };
	}

	_formatTaskItem(item) {
		if (!item) return null;
		return {
			_id: item._id,
			plate: item.QUEUE_PLATE || '',
			phone: item.QUEUE_PHONE || '',
			cargoName: item.QUEUE_CARGO_NAME || '',
			actionName: item.QUEUE_ACTION_NAME || '',
			status: item.QUEUE_STATUS,
			statusDesc: QueueModel.STATUS_DESC[Object.keys(QueueModel.STATUS).find(k => QueueModel.STATUS[k] === item.QUEUE_STATUS)] || '',
			callTimeText: item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '',
			confirmTimeText: item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '',
		};
	}
}

module.exports = ForkliftService;
