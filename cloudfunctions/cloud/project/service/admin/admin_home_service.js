/**
 * Notes: 后台HOME/登录模块
 * Date: 2021-03-15 07:48:00
 */

const BaseAdminService = require('./base_admin_service.js');

const dataUtil = require('../../../framework/utils/data_util.js');
const cacheUtil = require('../../../framework/utils/cache_util.js');

const cloudBase = require('../../../framework/cloud/cloud_base.js');
const timeUtil = require('../../../framework/utils/time_util.js');
const config = require('../../../config/config.js');
const bcrypt = require('bcryptjs');
const AdminModel = require('../../model/admin_model.js');
const LogModel = require('../../model/log_model.js');

const UserModel = require('../../model/user_model.js');
const MeetModel = require('../../model/meet_model.js');
const NewsModel = require('../../model/news_model.js');
const JoinModel = require('../../model/join_model.js');

class AdminHomeService extends BaseAdminService {

	/**
	 * 首页数据归集
	 */
	async adminHome() {
		let where = {};

		let userCnt = await UserModel.count(where);
		let meetCnt = await MeetModel.count(where);
		let newsCnt = await NewsModel.count(where);
		let joinCnt = await JoinModel.count(where);
		return {
			userCnt,
			meetCnt,
			newsCnt,
			joinCnt
		}
	}

	/** 清除缓存 */
	async clearCache() {
		await cacheUtil.clear();
	}

	/**
	 * 管理员登录（从云数据库验证）
	 * @param {*} name
	 * @param {*} password
	 */
	async adminLogin(name, password) {

		// 从数据库查管理员
		let where = {
			ADMIN_NAME: name,
			ADMIN_STATUS: 1
		};
		let fields = 'ADMIN_ID,ADMIN_NAME,ADMIN_PASSWORD,ADMIN_TYPE,ADMIN_LOGIN_TIME,ADMIN_LOGIN_CNT,ADMIN_LOGIN_FAIL_CNT,ADMIN_LOGIN_FAIL_TIME';
		let admin = await AdminModel.getOne(where, fields);

		if (!admin) {
			this.AppError('用户名或密码不正确');
		}

		// 检查是否被锁定（15分钟内连续失败5次）
		let failCnt = admin.ADMIN_LOGIN_FAIL_CNT || 0;
		let failTime = admin.ADMIN_LOGIN_FAIL_TIME || 0;
		let now = timeUtil.time();
		let lockDuration = 15 * 60 * 1000; // 15分钟（毫秒）

		if (failCnt >= 5 && (now - failTime) < lockDuration) {
			// 提示不暴露锁定态，防账号枚举
			this.AppError('用户名或密码不正确');
		}

		// bcrypt密码比对
		if (!bcrypt.compareSync(password, admin.ADMIN_PASSWORD)) {
			// 登录失败：增加失败计数
			let updateData = {
				ADMIN_LOGIN_FAIL_CNT: failCnt + 1,
				ADMIN_LOGIN_FAIL_TIME: now,
			};
			await AdminModel.edit(admin._id, updateData);

			this.AppError('用户名或密码不正确');
		}

		// 登录成功：重置失败计数
		let cnt = admin.ADMIN_LOGIN_CNT || 0;

		// 生成token
		let token = dataUtil.genRandomString(32);
		let tokenTime = timeUtil.time();
		let data = {
			ADMIN_TOKEN: token,
			ADMIN_TOKEN_TIME: tokenTime,
			ADMIN_LOGIN_TIME: timeUtil.time(),
			ADMIN_LOGIN_CNT: cnt + 1,
			ADMIN_LOGIN_FAIL_CNT: 0,
			ADMIN_LOGIN_FAIL_TIME: 0,
		}
		await AdminModel.edit(admin._id, data);

		let type = admin.ADMIN_TYPE;
		let last = (!admin.ADMIN_LOGIN_TIME) ? '尚未登录' : timeUtil.timestamp2Time(admin.ADMIN_LOGIN_TIME);

		// 写日志
		this.insertLog('登录了系统', admin, LogModel.TYPE.SYS);

		// 同步 ax_user 记录
		let user = await UserModel.getOne({
			USER_NAME: admin.ADMIN_NAME,
			USER_ROLE: 'admin'
		}, '_id');
		if (!user) {
			let userId = await UserModel.insert({
				USER_NAME: admin.ADMIN_NAME,
				USER_MINI_OPENID: '',
				USER_ROLE: 'admin',
				USER_STATUS: UserModel.STATUS.COMM,
			});
			user = { _id: userId };
		}

		return {
			id: user._id,
			token: token,
			name: admin.ADMIN_NAME,
			type,
			last,
			cnt
		}

	}


}

module.exports = AdminHomeService;