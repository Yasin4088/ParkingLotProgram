/**
 * Notes: 管理员控制模块
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2021-07-11 10:20:00
 */

const BaseAdminController = require('./base_admin_controller.js');
const LogModel = require('../../model/log_model.js');
const AdminModel = require('../../model/admin_model.js');

const AdminMgrService = require('../../service/admin/admin_mgr_service.js');
const timeUtil = require('../../../framework/utils/time_util.js');
const contentCheck = require('../../../framework/validate/content_check.js');

class AdminMgrController extends BaseAdminController {


	async getLogList() {
		await this.isAdmin();

		// 数据校验
		let rules = {
			search: 'string|min:1|max:30|name=搜索条件',
			sortType: 'string|name=搜索类型',
			sortVal: 'name=搜索类型值',
			orderBy: 'object|name=排序',
			whereEx: 'object|name=附加查询条件',
			page: 'must|int|default=1',
			size: 'int',
			isTotal: 'bool',
			oldTotal: 'int',
		};

		// 取得数据
		let input = this.validateData(rules);

		let service = new AdminMgrService();
		let result = await service.getLogList(input);

		// 数据格式化
		let list = result.list;
		for (let k in list) {
			list[k].LOG_TYPE_DESC = LogModel.getDesc('TYPE', list[k].LOG_TYPE);
			list[k].LOG_ADD_TIME = timeUtil.timestamp2Time(list[k].LOG_ADD_TIME);
		}
		result.list = list;

		return result;

	}

	/** 初始化管理员（一次性，无需登录） */
	async setupAdmin() {
		// 注意：此接口不调用 isAdmin()，因为此时还没有管理员

		let rules = {
			name: 'must|string|min:2|max:30|name=管理员名',
			pwd: 'must|string|min:4|max:30|name=密码',
		};

		let input = this.validateData(rules);

		let service = new AdminMgrService();
		return await service.setupAdmin(input.name, input.pwd);
	}

	/** 取得管理员列表 */
	async getAdminList() {
		await this.isAdmin();

		let rules = {
			search: 'string|min:1|max:30|name=搜索条件',
			sortType: 'string|name=搜索类型',
			sortVal: 'name=搜索类型值',
			orderBy: 'object|name=排序',
			whereEx: 'object|name=附加查询条件',
			page: 'must|int|default=1',
			size: 'int',
			isTotal: 'bool',
			oldTotal: 'int',
		};

		let input = this.validateData(rules);

		let service = new AdminMgrService();
		let result = await service.getAdminList(input);

		// 数据格式化
		let list = result.list;
		for (let k in list) {
			list[k].ADMIN_TYPE_DESC = AdminModel.getDesc('TYPE', list[k].ADMIN_TYPE);
			list[k].ADMIN_STATUS_DESC = AdminModel.getDesc('STATUS', list[k].ADMIN_STATUS);
			list[k].ADMIN_ADD_TIME = timeUtil.timestamp2Time(list[k].ADMIN_ADD_TIME);
			if (list[k].ADMIN_LOGIN_TIME) {
				list[k].ADMIN_LOGIN_TIME_DESC = timeUtil.timestamp2Time(list[k].ADMIN_LOGIN_TIME);
			} else {
				list[k].ADMIN_LOGIN_TIME_DESC = '尚未登录';
			}
			// 不返回密码和token给前端
			delete list[k].ADMIN_PASSWORD;
			delete list[k].ADMIN_TOKEN;
			delete list[k].ADMIN_TOKEN_TIME;
		}
		result.list = list;

		return result;
	}

	/** 取得管理员详情 */
	async getAdminDetail() {
		await this.isAdmin();

		let rules = {
			id: 'required|id',
		};

		let input = this.validateData(rules);

		let service = new AdminMgrService();
		let admin = await service.getAdminDetail(input.id);

		if (admin) {
			admin.ADMIN_ADD_TIME = timeUtil.timestamp2Time(admin.ADMIN_ADD_TIME);
		}

		// 不返回密码和token给前端
		delete admin.ADMIN_PASSWORD;
		delete admin.ADMIN_TOKEN;
		delete admin.ADMIN_TOKEN_TIME;

		return admin;
	}

	/** 新增管理员 */
	async insertAdmin() {
		await this.isSuperAdmin();

		let rules = {
			name: 'must|string|min:2|max:30|name=管理员名',
			password: 'must|string|min:4|max:30|name=密码',
			phone: 'string|max:20|name=手机号',
			type: 'int|default=0|name=管理员类型',
			status: 'int|default=1|name=状态',
		};

		let input = this.validateData(rules);

		let service = new AdminMgrService();
		let id = await service.insertAdmin({
			name: input.name,
			password: input.password,
			phone: input.phone || '',
			type: input.type,
			status: input.status,
		});

		this.log('新增了管理员「' + input.name + '」', LogModel.TYPE.SYS);

		return { id };
	}

	/** 编辑管理员 */
	async editAdmin() {
		await this.isSuperAdmin();

		let rules = {
			id: 'required|id',
			name: 'must|string|min:2|max:30|name=管理员名',
			phone: 'string|max:20|name=手机号',
			type: 'int|name=管理员类型',
			status: 'int|name=状态',
		};

		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('admin', input.id);

		let service = new AdminMgrService();
		await service.editAdmin(input.id, {
			name: input.name,
			phone: input.phone,
			type: input.type,
			status: input.status,
		});

		this.log('编辑了管理员「' + name + '」', LogModel.TYPE.SYS);

		return {};
	}

	/** 删除管理员 */
	async delAdmin() {
		await this.isSuperAdmin();

		let rules = {
			id: 'required|id',
		};

		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('admin', input.id);

		let service = new AdminMgrService();
		await service.delAdmin(input.id, this._adminId);

		this.log('删除了管理员「' + name + '」', LogModel.TYPE.SYS);

		return {};
	}

	/** 修改自己的密码 */
	async changePwd() {
		await this.isAdmin();

		let rules = {
			oldPwd: 'must|string|min:4|max:30|name=原密码',
			newPwd: 'must|string|min:4|max:30|name=新密码',
		};

		let input = this.validateData(rules);

		let service = new AdminMgrService();
		await service.changePwd(this._adminId, input.oldPwd, input.newPwd);

		this.log('修改了登录密码', LogModel.TYPE.SYS);

		return {};
	}

	/** 超级管理员重置他人密码 */
	async resetPwd() {
		await this.isSuperAdmin();

		let rules = {
			id: 'required|id',
			password: 'must|string|min:4|max:30|name=新密码',
		};

		let input = this.validateData(rules);

		let name = await this.getNameBeforeLog('admin', input.id);

		let service = new AdminMgrService();
		await service.resetPwd(input.id, input.password);

		this.log('重置了管理员「' + name + '」的密码', LogModel.TYPE.SYS);

		return {};
	}

}

module.exports = AdminMgrController;