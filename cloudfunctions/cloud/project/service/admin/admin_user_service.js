/**
 * Notes: 用户管理
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2022-01-22y 07:48:00
 */

const BaseAdminService = require('./base_admin_service.js');

const util = require('../../../framework/utils/util.js');
const bcrypt = require('bcryptjs');

const UserModel = require('../../model/user_model.js');
const JoinModel = require('../../model/join_model.js');

class AdminUserService extends BaseAdminService {


	/** 获得某个用户信息 */
	async getUser({
		userId,
		fields = '*'
	}) {
		let where = {
			USER_MINI_OPENID: userId,
		}
		return await UserModel.getOne(where, fields);
	}

	/** 取得用户分页列表 */
	async getUserList({
		search, // 搜索条件
		sortType, // 搜索菜单
		sortVal, // 搜索菜单
		orderBy, // 排序
		whereEx, //附加查询条件
		page,
		size,
		oldTotal = 0
	}) {
		orderBy = orderBy || { USER_ADD_TIME: 'desc' };
		let fields = '*';
		page = page || 1;
		size = size || 20;

		let where = {
			USER_ROLE: 'driver',
		};
		if (sortType && util.isDefined(sortVal)) {
			switch (sortType) {
				case 'status':
					where.USER_STATUS = Number(sortVal);
					break;
				case 'companyDef':
					where.USER_COMPANY_DEF = sortVal;
					break;
				case 'sort':
					if (sortVal == 'newdesc') orderBy = { USER_ADD_TIME: 'desc' };
					if (sortVal == 'newasc') orderBy = { USER_ADD_TIME: 'asc' };
					break;
			}
		}

		let result = await UserModel.getList(where, fields, orderBy, page, size, true, oldTotal);

		// 兼容历史数据：有些司机账号可能缺少 USER_ROLE 字段（但有密码）
		// 当 driver 精确过滤为空时，回退到"有密码账号"集合，避免新增后列表空白。
		if (page == 1 && (!result || !result.list || result.list.length == 0)) {
			let fallbackWhere = {
				USER_PASSWORD: ['<>', ''],
			};
			result = await UserModel.getList(fallbackWhere, fields, orderBy, page, size, true, oldTotal);
		}

		// 搜索兜底：如果后端组合条件不稳定，使用结果集二次过滤，保证可搜可见
		if (search) {
			let kw = String(search).toLowerCase();
			let allByRole = await UserModel.getAll({
				USER_ROLE: 'driver',
			}, fields, orderBy, 500);
			let allList = allByRole || [];

			if (allList.length == 0) {
				allList = await UserModel.getAll({
					USER_PASSWORD: ['<>', ''],
				}, fields, orderBy, 500) || [];
			}

			let filtered = allList.filter(item => {
				let name = (item.USER_NAME || '').toLowerCase();
				let mobile = (item.USER_MOBILE || '').toLowerCase();
				return name.includes(kw) || mobile.includes(kw);
			});

			let total = filtered.length;
			let start = (page - 1) * size;
			let list = filtered.slice(start, start + size);
			result = {
				page,
				size,
				total,
				count: Math.ceil(total / size) || 1,
				list,
			};
		}

		result.condition = encodeURIComponent(JSON.stringify(where));
		return result;
	}


	/** 添加司机 */
	async insertUser({
		username,
		password,
		phone
	}) {
		// 检查用户名是否已存在
		let exist = await UserModel.getOne({
			USER_NAME: username
		}, '_id');
		if (exist) {
			this.AppError('该用户名已存在');
		}

		let data = {
			USER_NAME: username,
			USER_PASSWORD: bcrypt.hashSync(password, 10),
			USER_MOBILE: phone || '',
			USER_ROLE: 'driver',
			USER_STATUS: UserModel.STATUS.COMM,
		};

		return await UserModel.insert(data);
	}

	/** 通过_id获取用户详情 */
	async getUserDetailById(id) {
		return await UserModel.getOne(id, '*');
	}

	/** 编辑用户 */
	async editUser(id, {
		username,
		password,
		phone,
		status
	}) {
		// 检查用户名是否被其他用户占用
		let exist = await UserModel.getOne({
			USER_NAME: username
		}, '_id');
		if (exist && exist._id != id) {
			this.AppError('该用户名已被其他用户使用');
		}

		let data = {
			USER_NAME: username,
			USER_MOBILE: phone || '',
			USER_ROLE: 'driver',
		};

		// 如果填写了新密码，则更新
		if (password) {
			data.USER_PASSWORD = bcrypt.hashSync(password, 10);
		}

		// 如果传了状态值，则更新
		if (status !== undefined && status !== null) {
			data.USER_STATUS = Number(status);
		}

		await UserModel.edit(id, data);
	}

	/** 删除用户 */
	async delUser(id) {
		await UserModel.del(id);
	}

}

module.exports = AdminUserService;