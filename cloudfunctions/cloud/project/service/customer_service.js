/**
 * Notes: 客户账号业务（月付/月结车牌池管理）
 * 客户账号由超级管理员创建（USER_ROLE=customer），负责录入月付司机的车牌；
 * 取柜登记时按取柜车牌自动匹配月付池，命中则本单免现场缴费（费用记公司月结）。
 * 池内每个车牌条目单次有效：登记时锁定、取柜完成时消去、中途取消自动释放。
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const StorageMplateModel = require('../model/storage_mplate_model.js');
const bcrypt = require('bcryptjs');
const timeUtil = require('../../framework/utils/time_util.js');

const PLATE_RE = /^[A-Z0-9\u4e00-\u9fa5-]{3,10}$/;

class CustomerService extends BaseService {

	/** 客户登录（用户名密码；15 分钟内连续失败 5 次锁定，提示不暴露锁定态） */
	async login(username, password) {
		let user = await UserModel.getOne({
			USER_NAME: username,
			USER_ROLE: 'customer'
		}, '_id,USER_NAME,USER_MOBILE,USER_PASSWORD,USER_STATUS,USER_LOGIN_CNT,USER_LOGIN_FAIL_CNT,USER_LOGIN_FAIL_TIME');

		if (!user) {
			this.AppError('用户名或密码不正确');
		}

		if (user.USER_STATUS === UserModel.STATUS.FORBID) {
			this.AppError('您的账户已被禁用，请联系管理员');
		}

		let now = timeUtil.time();
		let failCnt = user.USER_LOGIN_FAIL_CNT || 0;
		let failTime = user.USER_LOGIN_FAIL_TIME || 0;
		if (failCnt >= 5 && (now - failTime) < 15 * 60 * 1000) {
			this.AppError('用户名或密码不正确');
		}

		if (!bcrypt.compareSync(password, user.USER_PASSWORD)) {
			await UserModel.edit(user._id, {
				USER_LOGIN_FAIL_CNT: failCnt + 1,
				USER_LOGIN_FAIL_TIME: now
			});
			this.AppError('用户名或密码不正确');
		}

		await UserModel.edit(user._id, {
			USER_LOGIN_CNT: (user.USER_LOGIN_CNT || 0) + 1,
			USER_LOGIN_TIME: now,
			USER_LOGIN_FAIL_CNT: 0,
			USER_LOGIN_FAIL_TIME: 0,
		});

		return {
			id: user._id,
			token: user._id,
			name: user.USER_NAME,
			role: 'customer'
		};
	}

	/** 客户身份鉴权（token=ax_user _id，账号必须为启用中的客户角色） */
	async checkAuth(token) {
		if (!token) this.AppError('未登录，请重新登录');
		let user = await UserModel.getOne({
			_id: token,
			USER_ROLE: 'customer',
			USER_STATUS: UserModel.STATUS.COMM
		}, '_id,USER_NAME');
		if (!user) this.AppError('登录已过期或账号不可用，请重新登录');
		return user;
	}

	/** 客户首页：月付车牌池（有效/使用中）+ 已使用记录 + 统计 */
	async home(customerId) {
		let active = await StorageMplateModel.getAll({
			MPLATE_CUSTOMER_ID: customerId,
			MPLATE_STATUS: ['in', [StorageMplateModel.STATUS.ACTIVE, StorageMplateModel.STATUS.CLAIMED]]
		}, '*', { MPLATE_ADD_TIME: 'desc' }, 300);

		let consumed = await StorageMplateModel.getAll({
			MPLATE_CUSTOMER_ID: customerId,
			MPLATE_STATUS: StorageMplateModel.STATUS.CONSUMED
		}, '*', { MPLATE_CONSUME_TIME: 'desc' }, 100);

		let fmt = (list) => (list || []).map(x => ({
			_id: x._id,
			plate: x.MPLATE_PLATE,
			status: x.MPLATE_STATUS,
			statusDesc: StorageMplateModel.getDesc('STATUS', x.MPLATE_STATUS),
			addTimeText: x.MPLATE_ADD_TIME ? timeUtil.timestamp2Time(x.MPLATE_ADD_TIME) : '',
			consumeTimeText: x.MPLATE_CONSUME_TIME ? timeUtil.timestamp2Time(x.MPLATE_CONSUME_TIME) : '',
		}));

		return {
			active: fmt(active),
			consumed: fmt(consumed),
			stats: {
				active: (active || []).filter(x => x.MPLATE_STATUS === StorageMplateModel.STATUS.ACTIVE).length,
				claimed: (active || []).filter(x => x.MPLATE_STATUS === StorageMplateModel.STATUS.CLAIMED).length,
				consumed: (consumed || []).length,
			}
		};
	}

	/** 录入月付车牌（支持多车牌，换行/逗号/分号分隔；与池内已有有效车牌去重） */
	async addPlates(customerId, customerName, text) {
		let parts = String(text || '').split(/[\s,，、;；\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);

		let seen = {};
		let plates = [];
		for (let p of parts) {
			if (!PLATE_RE.test(p)) continue; // 非法车牌跳过
			if (seen[p]) continue;
			seen[p] = true;
			plates.push(p);
		}
		if (!plates.length) this.AppError('请输入正确的车牌号（每行一个，如 粤B12345）');
		if (plates.length > 100) this.AppError('单次最多录入 100 个车牌');

		let added = 0;
		let skipped = 0;
		let skipPlates = [];
		for (let p of plates) {
			// 与池内有效/使用中的同车牌去重（已消去的旧条目允许重新录入）
			let dup = await StorageMplateModel.getOne({
				MPLATE_CUSTOMER_ID: customerId,
				MPLATE_PLATE: p,
				MPLATE_STATUS: ['in', [StorageMplateModel.STATUS.ACTIVE, StorageMplateModel.STATUS.CLAIMED]]
			}, 'MPLATE_ID');
			if (dup) {
				skipped++;
				skipPlates.push(p);
				continue;
			}
			await StorageMplateModel.insert({
				MPLATE_PLATE: p,
				MPLATE_CUSTOMER_ID: customerId,
				MPLATE_CUSTOMER_NAME: customerName || '',
				MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE,
				MPLATE_STORAGE_ID: '',
				MPLATE_CLAIM_TIME: 0,
				MPLATE_CONSUME_TIME: 0,
			});
			added++;
		}

		return { added, skipped, skipPlates };
	}

	/** 删除自己录入且未被使用的车牌（占用中/已消去不可删） */
	async delPlate(customerId, plateId) {
		let entry = await StorageMplateModel.getOne({
			_id: plateId,
			MPLATE_CUSTOMER_ID: customerId,
			MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE
		}, 'MPLATE_ID');
		if (!entry) this.AppError('仅可删除自己录入且未被使用的车牌');

		await StorageMplateModel.del(entry._id);
		return { success: true };
	}

	/** 删除客户账号时清理其未使用的月付车牌（占用/已消去保留审计，不影响存取柜记录） */
	async cleanCustomerPlates(customerId) {
		await StorageMplateModel.del({
			MPLATE_CUSTOMER_ID: customerId,
			MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE
		});
	}
}

module.exports = CustomerService;
