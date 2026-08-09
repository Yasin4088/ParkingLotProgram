/**
 * Notes: 司机登录模块控制器
 * Date: 2021-03-15 19:20:00
 */

const BaseController = require('./base_controller.js');
const DriverService = require('../service/driver_service.js');

class DriverController extends BaseController {

	/** 司机登录 */
	async driverLogin() {

		// 数据校验
		let rules = {
			phone: 'must|mobile|name=手机号',
			pwd: 'must|string|min:4|max:30|name=密码',
		};

		// 取得数据
		let input = this.validateData(rules);

		let service = new DriverService();
		return await service.driverLogin(input.phone, input.pwd);
	}

	/** 获取司机详情 */
	async getMyDetail() {
		let service = new DriverService();
		return await service.getMyDetail(this._userId);
	}

}

module.exports = DriverController;
