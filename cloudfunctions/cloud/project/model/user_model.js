/**
 * Notes: 用户实体
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2020-10-14 19:20:00 
 */


const BaseModel = require('./base_model.js');
class UserModel extends BaseModel {}

// 集合名
UserModel.CL = "ax_user";

UserModel.DB_STRUCTURE = {
	_pid: 'string|true',
	USER_ID: 'string|true',

	USER_MINI_OPENID: 'string|false|comment=小程序openid',
	USER_STATUS: 'int|true|default=1|comment=状态 0=待审核,1=正常,9=已禁用',

	USER_NAME: 'string|false|comment=用户姓名',
	USER_MOBILE: 'string|false|comment=联系电话',
	USER_PASSWORD: 'string|false|comment=bcrypt密码',
	USER_ROLE: 'string|false|default=driver|comment=角色 driver=司机,admin=管理员,forklift=叉车司机,crane=吊柜司机',

	USER_WX_OPENID: 'string|false|comment=工作台(forklift/crane)账号绑定的微信openid，首登绑定，管理员可清除换设备',
	USER_LOGIN_FAIL_CNT: 'int|true|default=0|comment=工作台登录连续失败次数',
	USER_LOGIN_FAIL_TIME: 'int|false|comment=工作台最近登录失败时间',

	USER_WORK: 'string|false|comment=所在单位',
	USER_CITY: 'string|false|comment=所在城市',
	USER_TRADE: 'string|false|comment=职业领域',

	USER_IDCARD: 'string|false|comment=身份证号',
	USER_LICENSE_PLATE: 'string|false|comment=车牌号',
	USER_DRIVER_LICENSE_IMG: 'string|false|comment=驾驶证照片cloud fileID',
	USER_VEHICLE_REG_IMG: 'string|false|comment=行驶证照片cloud fileID',
	USER_IDCARD_IMG: 'string|false|comment=身份证照片cloud fileID',
	USER_PHONE_VERIFIED: 'int|true|default=0|comment=手机号是否已微信验证 0=否,1=是',


	USER_LOGIN_CNT: 'int|true|default=0|comment=登陆次数',
	USER_LOGIN_TIME: 'int|false|comment=最近登录时间',


	USER_ADD_TIME: 'int|true',
	USER_ADD_IP: 'string|false',

	USER_EDIT_TIME: 'int|true',
	USER_EDIT_IP: 'string|false',
}

// 字段前缀
UserModel.FIELD_PREFIX = "USER_";

/**
 * 状态 0=待审核,1=正常 
 */
UserModel.STATUS = {
	UNUSE: 0,
	COMM: 1,
	FORBID: 9
};

UserModel.STATUS_DESC = {
	UNUSE: '待审核',
	COMM: '正常',
	FORBID: '已禁用'
};


module.exports = UserModel;