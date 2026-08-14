/**
 * Notes: 叉车司机业务
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const QueueModel = require('../model/queue_model.js');
const bcrypt = require('bcryptjs');
const timeUtil = require('../../framework/utils/time_util.js');

class ForkliftService extends BaseService {

	/** 叉车/吊柜司机登录（身份由 USER_ROLE 决定：forklift=叉车,crane=吊柜） */
	async login(username, password) {
		let user = await UserModel.getOne({
			USER_NAME: username,
			USER_ROLE: ['in', 'forklift,crane']
		}, '_id,USER_NAME,USER_MOBILE,USER_PASSWORD,USER_STATUS,USER_ROLE,USER_LOGIN_CNT');

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
			role: user.USER_ROLE
		};
	}

	/** 获取叉车司机任务（抢单池 + 我的任务） */
	async getMyTask(userId) {
		let pool = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, '*', { QUEUE_CALL_TIME: 'asc' }, 50);

		let mine = await QueueModel.getAll({
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CALLED, QueueModel.STATUS.EXECUTING]]
		}, '*', { QUEUE_CALL_TIME: 'asc' }, 50);

		return {
			pool: (pool || []).map(item => this._formatTaskItem(item)),
			my: (mine || []).map(item => this._formatTaskItem(item))
		};
	}

	/** 叉车司机抢单（一单一叉车，先接先得） */
	async grabTask(userId, queueId) {
		let forklift = await UserModel.getOne({
			_id: userId
		}, 'USER_NAME');
		if (!forklift) this.AppError('叉车司机信息不存在');

		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, {
			QUEUE_FORKLIFT_ID: userId,
			QUEUE_FORKLIFT_NAME: forklift.USER_NAME,
			QUEUE_FORKLIFT_GRAB_TIME: now,
			QUEUE_FORKLIFT_GRAB_TYPE: QueueModel.GRAB_TYPE.GRAB,
		});
		if (!updated) this.AppError('手慢了，任务已被其他叉车司机抢走');

		// 尝试流转到执行中
		const QueueService = require('./queue_service.js');
		let queueService = new QueueService();
		return await queueService._tryExecuting(queueId);
	}

	/** 叉车司机完成作业（仅上传单据照片） */
	async completeTask(userId, queueId, billProof) {
		billProof = (billProof || '').trim();
		if (!billProof) this.AppError('请先上传单据照片');

		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.EXECUTING,
			QUEUE_FORKLIFT_ID: userId
		}, {
			QUEUE_STATUS: QueueModel.STATUS.FINISHED,
			QUEUE_FINISH_BILL_PROOF: billProof,
			QUEUE_FINISH_TIME: now,
		});
		if (!updated) this.AppError('任务状态已变更，无法完成');

		return { success: true };
	}

	_formatTaskItem(item) {
		if (!item) return null;

		return {
			_id: item._id,
			plate: item.QUEUE_PLATE || '',
			phone: item.QUEUE_PHONE || '',
			cargoName: item.QUEUE_CARGO_NAME || '',
			remark: item.QUEUE_REMARK || '',
			actionName: item.QUEUE_ACTION_NAME || '',
			queueNo: item.QUEUE_NO || '',
			status: item.QUEUE_STATUS,
			statusDesc: QueueModel.getDesc('STATUS', item.QUEUE_STATUS),
			callTimeText: item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '',
			confirmTimeText: item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '',
			driverConfirmed: item.QUEUE_DRIVER_CONFIRMED === 1,
			grabTypeDesc: item.QUEUE_FORKLIFT_ID ? QueueModel.getDesc('GRAB_TYPE', item.QUEUE_FORKLIFT_GRAB_TYPE) : '',
		};
	}
}

module.exports = ForkliftService;
