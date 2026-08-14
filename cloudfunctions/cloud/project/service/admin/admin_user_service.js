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
		oldTotal = 0,
		role = 'driver', // 角色过滤，默认司机
	}) {
		orderBy = orderBy || { USER_ADD_TIME: 'desc' };
		let fields = '*';
		page = page || 1;
		size = size || 20;

		let where = {};
		if (String(role).includes(',')) {
			// 多角色查询（如 forklift,crane：叉车/吊柜司机合并列表）
			where.USER_ROLE = ['in', role];
		} else {
			where.USER_ROLE = role;
		}
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
		if (role === 'driver' && page == 1 && (!result || !result.list || result.list.length == 0)) {
			let fallbackWhere = {
				USER_PASSWORD: ['<>', ''],
			};
			result = await UserModel.getList(fallbackWhere, fields, orderBy, page, size, true, oldTotal);
		}

		// 搜索兜底：司机和叉车司机都按姓名、手机号、车牌过滤。
		if (search) {
			let kw = String(search).toLowerCase();
			let allByRole = await UserModel.getAll(
				role.includes(',') ? { USER_ROLE: ['in', role] } : { USER_ROLE: role },
				fields, orderBy, 500);
			let allList = allByRole || [];

			if (role === 'driver' && allList.length == 0) {
				allList = await UserModel.getAll({
					USER_PASSWORD: ['<>', ''],
				}, fields, orderBy, 500) || [];
			}

			let filtered = allList.filter(item => {
				let name = (item.USER_NAME || '').toLowerCase();
				let mobile = (item.USER_MOBILE || '').toLowerCase();
				let plate = (item.USER_LICENSE_PLATE || '').toLowerCase();
				return name.includes(kw) || mobile.includes(kw) || plate.includes(kw);
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


	/** 添加用户（司机或叉车司机） */
	async insertUser({
		username,
		password,
		phone,
		role
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
			USER_ROLE: role || 'driver',
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
		status,
		role,
		wxClear
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
		};

		// 如果填写了新密码，则更新
		if (password) {
			data.USER_PASSWORD = bcrypt.hashSync(password, 10);
		}

		// 如果传了状态值，则更新
		if (status !== undefined && status !== null) {
			data.USER_STATUS = Number(status);
		}

		// 如果传了角色，则更新
		if (role) {
			data.USER_ROLE = role;
		}

		// 清除微信绑定（叉车/吊柜换设备登录用）
		if (wxClear === 1) {
			data.USER_WX_OPENID = '';
		}

		await UserModel.edit(id, data);
	}

	/** 设置用户状态（启用/禁用） */
	async setUserStatus(id, status) {
		// 状态值合法性校验（0=待审核,1=正常,9=已禁用）
		if (![UserModel.STATUS.UNUSE, UserModel.STATUS.COMM, UserModel.STATUS.FORBID].includes(status)) {
			this.AppError('非法的状态值');
		}

		let user = await UserModel.getOne(id, 'USER_STATUS');
		if (!user) this.AppError('用户不存在');

		await UserModel.edit(id, {
			USER_STATUS: status
		});
	}

	/** 删除用户 */
	async delUser(id) {
		await UserModel.del(id);
	}

}

module.exports = AdminUserService;
