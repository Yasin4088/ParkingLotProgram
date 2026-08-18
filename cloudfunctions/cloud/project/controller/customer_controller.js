/**
 * Notes: 客户账号控制器（月付车牌录入，账号 USER_ROLE=customer）
 */

const BaseController = require('./base_controller.js');
const CustomerService = require('../service/customer_service.js');

class CustomerController extends BaseController {

	/** 客户身份鉴权 */
	async _checkCustomer() {
		return await new CustomerService().checkAuth(this._token);
	}

	/** 客户登录（用户名密码） */
	async login() {
		let rules = {
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'must|string|min:4|max:30|name=密码',
		};
		let input = this.validateData(rules);

		let service = new CustomerService();
		return await service.login(input.username, input.password);
	}

	/** 客户首页：月付车牌池 + 已使用记录 */
	async home() {
		let me = await this._checkCustomer();
		let service = new CustomerService();
		return await service.home(me._id);
	}

	/** 录入月付车牌（多车牌，换行/逗号/分号分隔） */
	async plateAdd() {
		let me = await this._checkCustomer();
		let rules = {
			plates: 'must|string|min:1|max:1000|name=车牌',
		};
		let input = this.validateData(rules);

		let service = new CustomerService();
		return await service.addPlates(me._id, me.USER_NAME, input.plates);
	}

	/** 删除自己录入且未使用的车牌 */
	async plateDel() {
		let me = await this._checkCustomer();
		let rules = {
			id: 'must|string|name=车牌记录',
		};
		let input = this.validateData(rules);

		let service = new CustomerService();
		return await service.delPlate(me._id, input.id);
	}
}

module.exports = CustomerController;
