/**
 * Notes: 装卸排队记录实体
 */

const BaseModel = require('./base_model.js');

class QueueModel extends BaseModel {}

QueueModel.CL = 'ax_queue';

QueueModel.DB_STRUCTURE = {
	_pid: 'string|true',
	QUEUE_ID: 'string|true',

	QUEUE_USER_ID: 'string|true|comment=用户记录ID',
	QUEUE_OPENID: 'string|true|comment=微信openid',
	QUEUE_PHONE: 'string|false|comment=司机手机号',
	QUEUE_PLATE: 'string|false|comment=车牌号',

	QUEUE_LOT_ID: 'string|true|comment=停车场ID',
	QUEUE_LOT_NAME: 'string|true|comment=停车场名称',
	QUEUE_ACTION: 'string|true|comment=业务类型 load=装货,unload=卸货',
	QUEUE_ACTION_NAME: 'string|true|comment=业务类型名称',
	QUEUE_PROOF: 'string|false|comment=上传单证图片fileID',
	QUEUE_CARGO_NAME: 'string|false|comment=货物名称',

	QUEUE_NO: 'string|false|comment=排队号',
	QUEUE_STATUS: 'int|true|default=0|comment=状态 0=已预约,1=排队中,2=已叫号,9=已完成,10=已取消',
	QUEUE_SUBSCRIBE: 'int|true|default=0|comment=是否点击订阅叫号通知',

	QUEUE_CHECKIN_LAT: 'float|false|comment=签到纬度',
	QUEUE_CHECKIN_LNG: 'float|false|comment=签到经度',
	QUEUE_CHECKIN_TIME: 'int|true|default=0|comment=签到时间',
	QUEUE_CALL_TIME: 'int|true|default=0|comment=叫号时间',
	QUEUE_FINISH_TIME: 'int|true|default=0|comment=完成时间',
	QUEUE_CANCEL_TIME: 'int|true|default=0|comment=取消时间',
	QUEUE_CANCEL_REASON: 'string|false|comment=取消原因',
	QUEUE_CANCEL_OPERATOR: 'string|false|comment=取消操作人',

	QUEUE_ADD_TIME: 'int|true',
	QUEUE_EDIT_TIME: 'int|true',
	QUEUE_ADD_IP: 'string|false',
	QUEUE_EDIT_IP: 'string|false',
};

QueueModel.FIELD_PREFIX = 'QUEUE_';

QueueModel.STATUS = {
	BOOKED: 0,
	WAITING: 1,
	CALLED: 2,
	DONE: 9,
	CANCEL: 10
};

QueueModel.STATUS_DESC = {
	BOOKED: '已预约',
	WAITING: '排队中',
	CALLED: '已叫号',
	DONE: '已完成',
	CANCEL: '已取消'
};

module.exports = QueueModel;
