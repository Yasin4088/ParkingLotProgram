/**
 * Notes: 司机登录模块控制器
 * Date: 2021-03-15 19:20:00
 * Update: 2026-08-10 微信登录+注册
 */

const BaseController = require('./base_controller.js');
const DriverService = require('../service/driver_service.js');

class DriverController extends BaseController {

	/** 微信一键登录 */
	async wxLogin() {
		let service = new DriverService();
		return await service.wxLogin(this._userId);
	}

	/** 司机注册（首次填写个人信息+上传三证） */
	async register() {
		let rules = {
			name: 'must|string|min:2|max:20|name=姓名',
			phone: 'must|mobile|name=手机号',
			idCard: 'must|string|len:18|name=身份证号',
			licensePlate: 'must|string|min:5|max:10|name=车牌号',
			driverLicenseImg: 'must|string|name=驾驶证照片',
			vehicleRegImg: 'must|string|name=行驶证照片',
			idCardImg: 'must|string|name=身份证照片',
		};
		let input = this.validateData(rules);

		let service = new DriverService();
		return await service.register(this._userId, input);
	}

	/** 微信手机号换取 */
	async getPhoneNumber() {
		let rules = {
			code: 'must|string|name=手机号code',
		};
		let input = this.validateData(rules);

		let service = new DriverService();
		return await service.getPhoneNumber(input.code);
	}

	/** 司机修改个人信息 */
	async updateInfo() {
		let rules = {
			name: 'string|min:2|max:20|name=姓名',
			phone: 'string|name=手机号',
			idCard: 'string|len:18|name=身份证号',
			licensePlate: 'string|min:5|max:10|name=车牌号',
			driverLicenseImg: 'string|name=驾驶证照片',
			vehicleRegImg: 'string|name=行驶证照片',
			idCardImg: 'string|name=身份证照片',
		};
		let input = this.validateData(rules);

		let service = new DriverService();
		return await service.updateInfo(this._userId, input);
	}

	/** 获取司机详情 */
	async getMyDetail() {
		let service = new DriverService();
		return await service.getMyDetail(this._userId);
	}

}

module.exports = DriverController;
