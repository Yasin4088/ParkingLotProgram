/**
 * Notes: 管理员管理
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2021-07-11 07:48:00
 */

const BaseAdminService = require('./base_admin_service.js');

const util = require('../../../framework/utils/util.js');
const bcrypt = require('bcryptjs');
const AdminModel = require('../../model/admin_model.js');
const LogModel = require('../../model/log_model.js');
const cloudBase = require('../../../framework/cloud/cloud_base.js');
const timeUtil = require('../../../framework/utils/time_util.js');


class AdminMgrService extends BaseAdminService {


	/** 取得日志分页列表 */
	async getLogList({
		search, // 搜索条件
		sortType, // 搜索菜单
		sortVal, // 搜索菜单
		orderBy, // 排序
		whereEx, //附加查询条件
		page,
		size,
		oldTotal = 0
	}) {

		orderBy = orderBy || {
			LOG_ADD_TIME: 'desc'
		};
		let fields = '*';
		let where = {};

		if (util.isDefined(search) && search) {
			where.or = [{
				LOG_CONTENT: ['like', search]
			}, {
				LOG_ADMIN_NAME: ['like', search]
			}, {
				LOG_ADD_IP: ['like', search]
			}];

		} else if (sortType && util.isDefined(sortVal)) {
			// 搜索菜单
			switch (sortType) {
				case 'type':
					// 按类型
					where.LOG_TYPE = Number(sortVal);
					break;
			}
		}
		let result = await LogModel.getList(where, fields, orderBy, page, size, true, oldTotal);


		return result;
	}

	/** 初始化创建超级管理员（仅当无管理员时可用；事务+哨兵文档防并发建双超管） */
	async setupAdmin(name, password) {
		let adminCnt = await AdminModel.count({});
		if (adminCnt > 0) {
			this.AppError('系统已初始化，无法重复设置');
		}

		let data = {
			ADMIN_NAME: name,
			ADMIN_PASSWORD: bcrypt.hashSync(password, 10),
			ADMIN_PHONE: '13900000000',
			ADMIN_TYPE: AdminModel.TYPE.SUPER,
			ADMIN_STATUS: AdminModel.STATUS.ON,
		};

		const db = cloudBase.getCloud().database();
		let lockId = 'SETUP_ADMIN_' + global.PID;
		let id = await db.runTransaction(async t => {
			let lock = null;
			try {
				lock = await t.collection('ax_setup').doc(lockId).get();
			} catch (e) {
				lock = null; // 文档不存在
			}
			if (lock && lock.data) this.AppError('系统已初始化，无法重复设置');
			await t.collection('ax_setup').doc(lockId).set({
				data: { _pid: global.PID, SETUP_ADMIN_TIME: timeUtil.time() }
			});
			let res = await t.collection('ax_admin').add({ data });
			return res._id;
		});

		// 写入初始化日志
		await this.insertLog('系统初始化，创建了超级管理员「' + name + '」', {
			ADMIN_ID: id,
			ADMIN_NAME: name,
			ADMIN_PHONE: '13900000000'
		}, LogModel.TYPE.SYS);

		return { id, name };
	}

	/** 取得管理员分页列表 */
	async getAdminList({
		search,
		sortType,
		sortVal,
		orderBy,
		whereEx,
		page,
		size,
		oldTotal = 0
	}) {
		orderBy = orderBy || { ADMIN_ADD_TIME: 'desc' };
		let fields = '*';
		let where = {};

		if (util.isDefined(search) && search) {
			where.or = [
				{ ADMIN_NAME: ['like', search] },
				{ ADMIN_PHONE: ['like', search] },
			];
		} else if (sortType && util.isDefined(sortVal)) {
			switch (sortType) {
				case 'type':
					where.ADMIN_TYPE = Number(sortVal);
					break;
				case 'status':
					where.ADMIN_STATUS = Number(sortVal);
					break;
			}
		}

		return await AdminModel.getList(where, fields, orderBy, page, size, true, oldTotal);
	}

	/** 取得单个管理员详情 */
	async getAdminDetail(id) {
		let fields = 'ADMIN_ID,ADMIN_NAME,ADMIN_PHONE,ADMIN_TYPE,ADMIN_STATUS,ADMIN_LOGIN_CNT,ADMIN_LOGIN_TIME,ADMIN_LOGIN_FAIL_CNT,ADMIN_ADD_TIME';
		return await AdminModel.getOne(id, fields);
	}

	/** 新增管理员 */
	async insertAdmin({ name, password, phone, type, status }) {
		let exist = await AdminModel.getOne({ ADMIN_NAME: name }, '_id');
		if (exist) {
			this.AppError('该管理员名已存在');
		}

		let data = {
			ADMIN_NAME: name,
			ADMIN_PASSWORD: bcrypt.hashSync(password, 10),
			ADMIN_PHONE: phone || '',
			ADMIN_TYPE: type !== undefined ? type : AdminModel.TYPE.NORMAL,
			ADMIN_STATUS: status !== undefined ? status : AdminModel.STATUS.ON,
		};
		return await AdminModel.insert(data);
	}

	/** 编辑管理员 */
	async editAdmin(id, { name, phone, type, status }) {
		let where = { ADMIN_NAME: name };
		let exist = await AdminModel.getOne(where, '_id');
		if (exist && String(exist._id) !== String(id)) {
			this.AppError('该管理员名已被其他管理员使用');
		}

		let data = {};
		if (name !== undefined) data.ADMIN_NAME = name;
		if (phone !== undefined) data.ADMIN_PHONE = phone;
		if (type !== undefined) data.ADMIN_TYPE = type;
		if (status !== undefined) data.ADMIN_STATUS = status;

		await AdminModel.edit(id, data);
	}

	/** 删除管理员 */
	async delAdmin(id, currentAdminId) {
		if (String(id) === String(currentAdminId)) {
			this.AppError('不能删除自己的账号');
		}
		await AdminModel.del(id);
	}

	/** 修改自己的密码 */
	async changePwd(adminId, oldPassword, newPassword) {
		let admin = await AdminModel.getOne(adminId, 'ADMIN_PASSWORD');
		if (!admin) {
			this.AppError('管理员不存在');
		}

		if (!bcrypt.compareSync(oldPassword, admin.ADMIN_PASSWORD)) {
			this.AppError('原密码不正确');
		}

		await AdminModel.edit(adminId, {
			ADMIN_PASSWORD: bcrypt.hashSync(newPassword, 10),
		});
	}

	/** 超级管理员重置他人密码 */
	async resetPwd(id, newPassword) {
		let admin = await AdminModel.getOne(id, 'ADMIN_ID,ADMIN_NAME');
		if (!admin) {
			this.AppError('管理员不存在');
		}

		await AdminModel.edit(id, {
			ADMIN_PASSWORD: bcrypt.hashSync(newPassword, 10),
		});

		return { name: admin.ADMIN_NAME };
	}

}

module.exports = AdminMgrService;