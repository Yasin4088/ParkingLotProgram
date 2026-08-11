/**
 * Notes: 系统管理员实体 
 * Date: 2021-03-15 19:20:00 
 */


const BaseModel = require('./base_model.js');

class AdminModel extends BaseModel {

}

// 集合名
AdminModel.CL = "ax_admin";

AdminModel.DB_STRUCTURE = {
	_pid: 'string|true',
	ADMIN_ID: 'string|true',
	ADMIN_NAME: 'string|true',
	ADMIN_PHONE: 'string|true|comment=登录电话',
	ADMIN_PASSWORD: 'string|true|comment=bcrypt密码',
	ADMIN_STATUS: 'int|true|default=1|comment=状态：0=禁用 1=启用',

	ADMIN_LOGIN_CNT: 'int|true|default=0|comment=登录次数',
	ADMIN_LOGIN_TIME: 'int|true|default=0|comment=最后登录时间',
	ADMIN_TYPE: 'int|true|default=0|comment=类型 0=普通管理员 1=超级管理员',

	ADMIN_LOGIN_FAIL_CNT: 'int|true|default=0|comment=连续登录失败次数',
	ADMIN_LOGIN_FAIL_TIME: 'int|true|default=0|comment=最后登录失败时间',

	ADMIN_TOKEN: 'string|false|comment=当前登录token',
	ADMIN_TOKEN_TIME: 'int|true|default=0|comment=当前登录token time',

	ADMIN_ADD_TIME: 'int|true',
	ADMIN_EDIT_TIME: 'int|true',
	ADMIN_ADD_IP: 'string|false',
	ADMIN_EDIT_IP: 'string|false',
};

// 字段前缀
AdminModel.FIELD_PREFIX = "ADMIN_";

// 管理员类型
AdminModel.TYPE = {
	NORMAL: 0,
	SUPER: 1
};
AdminModel.TYPE_DESC = {
	NORMAL: '普通管理员',
	SUPER: '超级管理员'
};

// 管理员状态
AdminModel.STATUS = {
	OFF: 0,
	ON: 1
};
AdminModel.STATUS_DESC = {
	OFF: '已禁用',
	ON: '正常'
};






module.exports = AdminModel;