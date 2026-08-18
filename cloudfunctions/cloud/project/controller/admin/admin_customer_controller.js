/**
 * Notes: 客户账号管理控制器（仅超级管理员：创建/编辑/删除月付客户账号）
 */

const BaseAdminController = require('./base_admin_controller.js');
const LogModel = require('../../model/log_model.js');
const AdminUserService = require('../../service/admin/admin_user_service.js');
const CustomerService = require('../../service/customer_service.js');

class AdminCustomerController extends BaseAdminController {

	/** 新增客户账号（超管） */
	async insert() {
		await this.isSuperAdmin();

		let rules = {
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'must|string|min:4|max:30|name=密码',
			phone: 'string|max:20|name=手机号',
		};
		let input = this.validateData(rules);

		let service = new AdminUserService();
		let id = await service.insertUser({
			username: input.username,
			password: input.password,
			phone: input.phone || '',
			role: 'customer',
		});

		this.log('新增了客户「' + input.username + '」', LogModel.TYPE.USER);

		return { id };
	}

	/** 编辑客户账号（超管：改名/手机号/启用禁用/可选改密码） */
	async edit() {
		await this.isSuperAdmin();

		let rules = {
			id: 'required|id',
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'string|min:4|max:30|name=密码',
			phone: 'string|max:20|name=手机号',
			status: 'int|name=状态',
		};
		let input = this.validateData(rules);

		let service = new AdminUserService();
		await service.editUser(input.id, {
			username: input.username,
			password: input.password || '',
			phone: input.phone || '',
			status: input.status,
			role: 'customer',
		});

		this.log('编辑了客户「' + input.username + '」', LogModel.TYPE.USER);

		return {};
	}

	/** 删除客户账号（超管；同步清理其未使用的月付车牌） */
	async del() {
		await this.isSuperAdmin();

		let rules = {
			id: 'required|id',
		};
		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('user', input.id);

		// 清理未使用的月付车牌（占用/已消去保留审计，不影响存取柜记录）
		await new CustomerService().cleanCustomerPlates(input.id);
		await new AdminUserService().delUser(input.id);

		this.log('删除了客户「' + name + '」', LogModel.TYPE.USER);

		return {};
	}
}

module.exports = AdminCustomerController;
