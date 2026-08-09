/**
 * Notes: 司机登录模块业务逻辑
 * Date: 2021-03-15 19:20:00
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const dataUtil = require('../../framework/utils/data_util.js');
const timeUtil = require('../../framework/utils/time_util.js');
const md5Lib = require('../../framework/lib/md5_lib.js');

class DriverService extends BaseService {

	/**
	 * 司机登录
	 * @param {*} phone 手机号
	 * @param {*} pwd 明文密码
	 */
	async driverLogin(phone, pwd) {

		// 查用户
		let where = {
			USER_MOBILE: phone
		};
		let user = await UserModel.getOne(where, 'USER_MINI_OPENID,USER_MOBILE,USER_NAME,USER_PASSWORD,USER_STATUS');

		// 用户不存在 → 自动注册
		if (!user) {
			let userId = await this.registerUser(phone, pwd);
			user = await UserModel.getOne({_id: userId}, 'USER_MINI_OPENID,USER_MOBILE,USER_NAME,USER_PASSWORD,USER_STATUS');
		}

		// 检查是否被禁用
		if (user.USER_STATUS === UserModel.STATUS.FORBID) {
			this.AppError('您的账户已被禁用，请联系管理员');
		}

		// 验证密码
		let inputPwd = md5Lib.md5(pwd);
		if (inputPwd !== user.USER_PASSWORD) {
			this.AppError('手机号或密码不正确');
		}

		// 更新登录次数和时间
		let cnt = (user.USER_LOGIN_CNT || 0) + 1;
		let data = {
			USER_LOGIN_CNT: cnt,
			USER_LOGIN_TIME: timeUtil.time()
		};
		await UserModel.edit(user._id, data);

		// 返回用户信息（token 就是用户的 openId）
		return {
			token: user.USER_MINI_OPENID,
			name: user.USER_NAME || phone,
			phone: user.USER_MOBILE,
			id: user._id
		};
	}

	/**
	 * 注册新用户
	 * @param {*} phone
	 * @param {*} pwd
	 * @param {*} name
	 */
	async registerUser(phone, pwd, name = '') {
		// 再次检查手机号是否已注册（并发安全）
		let where = {
			USER_MOBILE: phone
		};
		let cnt = await UserModel.count(where);
		if (cnt > 0) {
			this.AppError('该手机号已注册，请直接登录');
		}

		let data = {
			USER_MOBILE: phone,
			USER_PASSWORD: md5Lib.md5(pwd),
			USER_NAME: name || phone,
			USER_STATUS: UserModel.STATUS.COMM,
			USER_LOGIN_CNT: 0,
			USER_LOGIN_TIME: 0
		};

		return await UserModel.insert(data);
	}

	/**
	 * 获取司机详情
	 * @param {*} userId
	 */
	async getMyDetail(userId) {
		let where = {
			USER_MINI_OPENID: userId
		};
		let fields = 'USER_MOBILE,USER_NAME,USER_CITY,USER_TRADE,USER_WORK,USER_STATUS';
		return await UserModel.getOne(where, fields);
	}

}

module.exports = DriverService;
