/**
 * Notes: 存取柜柜型实体
 */

const BaseModel = require('./base_model.js');

class CabinetModel extends BaseModel {}

CabinetModel.CL = 'ax_storage_cabinet';

CabinetModel.DB_STRUCTURE = {
	_pid: 'string|true',
	CABINET_ID: 'string|true',

	CABINET_NAME: 'string|true|comment=柜型名称',
	CABINET_PRICE_DAILY: 'int|true|default=0|comment=每日单价(分)',
	CABINET_STATUS: 'int|true|default=1|comment=状态 1=启用,9=禁用',
	CABINET_ORDER: 'int|true|default=9999|comment=排序值,越小越靠前',

	CABINET_ADD_TIME: 'int|true',
	CABINET_EDIT_TIME: 'int|true',
	CABINET_ADD_IP: 'string|false',
	CABINET_EDIT_IP: 'string|false',
};

CabinetModel.FIELD_PREFIX = 'CABINET_';

CabinetModel.STATUS = {
	OPEN: 1,
	FORBID: 9
};

CabinetModel.STATUS_DESC = {
	OPEN: '启用',
	FORBID: '禁用'
};

module.exports = CabinetModel;
