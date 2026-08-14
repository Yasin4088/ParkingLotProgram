/**
 * Notes: 用户控制模块
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2022-01-22 10:20:00
 */

const BaseAdminController = require('./base_admin_controller.js');

const UserModel = require('../../model/user_model.js');
const LogModel = require('../../model/log_model.js');
const AdminUserService = require('../../service/admin/admin_user_service.js');
const timeUtil = require('../../../framework/utils/time_util.js');

class AdminUserController extends BaseAdminController {


	/** 用户信息 */
	async getUserDetail() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
		};

		let input = this.validateData(rules);

		let service = new AdminUserService();
		let user = await service.getUser({
			userId: input.id
		});

		if (user) {
			user.USER_ADD_TIME = timeUtil.timestamp2Time(user.USER_ADD_TIME);
			user.USER_LOGIN_TIME = user.USER_LOGIN_TIME ? timeUtil.timestamp2Time(user.USER_LOGIN_TIME) : '未登录';
		}

		return user;
	}


	/** 用户列表 */
	async getUserList() {
		await this.isAdmin();

		let rules = {
			search: 'string|min:1|max:30|name=搜索条件',
			sortType: 'string|name=搜索类型',
			sortVal: 'name=搜索类型值',
			orderBy: 'object|name=排序',
			whereEx: 'object|name=附加查询条件',
			page: 'required|int|default=1',
			size: 'int',
			isTotal: 'bool',
			oldTotal: 'int',
			role: 'string|name=角色',
		};

		let input = this.validateData(rules);

		let service = new AdminUserService();
		let result = await service.getUserList(input);

		let list = result.list;
		for (let k in list) {
			list[k].USER_STATUS_DESC = UserModel.getDesc('STATUS', list[k].USER_STATUS);
			list[k].USER_ADD_TIME = timeUtil.timestamp2Time(list[k].USER_ADD_TIME);
			list[k].USER_LOGIN_TIME = list[k].USER_LOGIN_TIME ? timeUtil.timestamp2Time(list[k].USER_LOGIN_TIME) : '未登录';
		}
		result.list = list;
		return result;
	}

	/** 删除用户 */
	async delUser() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
		};

		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('user', input.id);

		let service = new AdminUserService();
		await service.delUser(input.id);

		this.log('删除了用户「' + name + '」', LogModel.TYPE.USER);
	}

	/** 新增用户（司机或叉车司机） */
	async insertUser() {
		await this.isAdmin();

		let rules = {
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'must|string|min:4|max:30|name=密码',
			phone: 'string|max:20|name=手机号',
			role: 'string|name=角色',
		};

		let input = this.validateData(rules);

		let service = new AdminUserService();
		let id = await service.insertUser({
			username: input.username,
			password: input.password,
			phone: input.phone || '',
			role: input.role || 'driver',
		});

		let roleLabel = input.role === 'crane' ? '吊柜司机' : (input.role === 'forklift' ? '叉车司机' : '司机');
		this.log('新增了' + roleLabel + '「' + input.username + '」', LogModel.TYPE.USER);

		return { id };
	}

	/** 通过_id获取用户详情（用于编辑页加载） */
	async getUserDetailById() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
		};

		let input = this.validateData(rules);

		let service = new AdminUserService();
		let user = await service.getUserDetailById(input.id);

		if (user) {
			user.USER_ADD_TIME = timeUtil.timestamp2Time(user.USER_ADD_TIME);
			user.USER_LOGIN_TIME = user.USER_LOGIN_TIME ? timeUtil.timestamp2Time(user.USER_LOGIN_TIME) : '未登录';
			user.USER_EDIT_TIME = user.USER_EDIT_TIME ? timeUtil.timestamp2Time(user.USER_EDIT_TIME) : '';
			delete user.USER_PASSWORD;
		}

		return user;
	}

	/** 编辑用户 */
	async editUser() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'string|min:4|max:30|name=密码',
			phone: 'string|max:20|name=手机号',
			status: 'int|name=状态',
			role: 'string|name=角色',
		};

		let input = this.validateData(rules);

		let service = new AdminUserService();
		await service.editUser(input.id, {
			username: input.username,
			password: input.password || '',
			phone: input.phone || '',
			status: input.status,
			role: input.role || '',
		});

		this.log('编辑了用户「' + input.username + '」', LogModel.TYPE.USER);

		return {};
	}

	/** 设置用户状态（启用/禁用） */
	async userStatus() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
			status: 'required|int',
		};

		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('user', input.id);

		let service = new AdminUserService();
		await service.setUserStatus(input.id, input.status);

		this.log('修改了用户「' + name + '」状态', LogModel.TYPE.USER);
	}
}

module.exports = AdminUserController;
