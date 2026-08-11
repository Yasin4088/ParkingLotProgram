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

		// 数据校验
		let rules = {
			id: 'required|id',
		};

		// 取得数据
		let input = this.validateData(rules);

		let service = new AdminUserService();
		let user = await service.getUser({
			userId: input.id
		});

		if (user) {
			// 显示转换
			user.USER_ADD_TIME = timeUtil.timestamp2Time(user.USER_ADD_TIME);
			user.USER_LOGIN_TIME = user.USER_LOGIN_TIME ? timeUtil.timestamp2Time(user.USER_LOGIN_TIME) : '未登录';
		}

		return user;
	}


	/** 用户列表 */
	async getUserList() {
		await this.isAdmin();

		// 数据校验
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
		};

		// 取得数据
		let input = this.validateData(rules);

		let service = new AdminUserService();
		let result = await service.getUserList(input);

		// 数据格式化
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

		// 数据校验
		let rules = {
			id: 'required|id',
		};

		// 取得数据
		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('user', input.id);

		let service = new AdminUserService();
		await service.delUser(input.id);

		this.log('删除了客户「' + name + '」', LogModel.TYPE.USER);

	}

	/** 新增司机 */
	async insertUser() {
		await this.isAdmin();

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
		});

		this.log('新增了司机「' + input.username + '」', LogModel.TYPE.USER);

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
			// 删除密码字段，不暴露给前端
			delete user.USER_PASSWORD;
		}

		return user;
	}

	/** 编辑司机 */
	async editUser() {
		await this.isAdmin();

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
		});

		this.log('编辑了司机「' + input.username + '」', LogModel.TYPE.USER);

		return {};
	}
}

module.exports = AdminUserController;