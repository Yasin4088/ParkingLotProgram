/**
 * Notes: 本业务基本控制器
 * Date: 2021-03-15 19:20:00 
 */

const timeUtil = require('../../framework/utils/time_util.js');
const Controller = require('../../framework/client/controller.js');
const dataCheck = require('../../framework/validate/data_check.js');
const config = require('../../config/config.js');
const util = require('../../framework/utils/util.js');
const AppError = require('../../framework/core/app_error.js');
const appCode = require('../../framework/core/app_code.js');
const BaseService = require('../service/base_service.js');
const UserModel = require('../model/user_model.js');

global.PID = 'unknown';

class BaseController extends Controller {

	constructor(route, openId, event) {
		super(route, openId, event);

		if (config.TEST_MODE)
			openId = config.TEST_TOKEN_ID;

		if (!openId) {
			console.error('OPENID is unfined');
			throw new AppError('OPENID is unfined', appCode.SVR);
		}

		// 模板判定
		if (config.PID) {
			global.PID = config.PID;
		} else {
			if (event.PID) global.PID = event.PID;
		}

		console.log(`【↘event.PID=${event.PID}, global.PID=${global.PID}】`);

		let userId = openId;

		this._token = event.token || '';

		this._userId = userId;

		// 当前时间戳
		this._timestamp = timeUtil.time();
		let time = timeUtil.time('Y-M-D h:m:s');

		console.log('------------------------');
		console.log(`【${time}】【Request -- ↘↘↘】\n【↘Token = ${this._token}】\n【↘USER-ID = ${userId}】\n【↘↘IN DATA】=\n`, JSON.stringify(this._request, null, 4));



	}

	/**
	 * 数据校验
	 * @param {*} rules 
	 */
	validateData(rules = {}) {
		let input = this._request;
		return dataCheck.check(input, rules);
	}

	// 取得某个具体的参数值
	getParameter(name) {
		let input = this._request;
		if (util.isDefined(input[name]))
			return input[name];
		else
			return '';
	}

	async initSetup() {
		let service = new BaseService();
		await service.initSetup();
	}

	/**
	 * 抛出异常（与 BaseService 同签名）
	 * @param {*} msg
	 * @param {*} code
	 */
	AppError(msg, code = appCode.LOGIC) {
		throw new AppError(msg, code);
	}

	/** 工作台鉴权：token 对应用户必须是指定角色（forklift/crane）、账号正常、
	 * 且已绑定本机微信 OPENID（杜绝拿他人 _id 冒充），保证叉车/吊柜两工作台互不通用 */
	async checkWorkRole(role) {
		if (!this._token) this.AppError('未登录，请重新登录');
		let user = await UserModel.getOne({
			_id: this._token,
			USER_ROLE: role,
			USER_STATUS: UserModel.STATUS.COMM,
			USER_WX_OPENID: this._userId
		}, '_id');
		if (!user) this.AppError('账号无操作权限、未绑定本机微信或已被禁用，请重新登录');
		return user;
	}

	/** 司机身份（服务端可信）：以调用者 OPENID 查 ax_user，忽略客户端 token，杜绝 _id 伪造冒充 */
	async getDriverId() {
		let user = await UserModel.getOne({
			USER_MINI_OPENID: this._userId,
			USER_ROLE: 'driver'
		}, '_id,USER_STATUS');
		if (!user) this.AppError('司机账号不存在，请重新登录');
		if (user.USER_STATUS !== UserModel.STATUS.COMM) this.AppError('账号不可用，请联系管理员');
		return user;
	}
}

module.exports = BaseController;