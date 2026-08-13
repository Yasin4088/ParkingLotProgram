/**
 * Notes: 预约后台管理
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY www.code3721.com
 * Date: 2022-12-08 07:48:00 
 */

const BaseAdminService = require('./base_admin_service.js');
const timeUtil = require('../../../framework/utils/time_util.js');

const MeetModel = require('../../model/meet_model.js');
const JoinModel = require('../../model/join_model.js');
const UserModel = require('../../model/user_model.js');

const DataService = require('./../data_service');
const QueueService = require('./../queue_service.js');

// 导出报名数据KEY
const EXPORT_JOIN_DATA_KEY = 'join_data';

// 导出用户数据KEY
const EXPORT_USER_DATA_KEY = 'user_data';

// 导出装卸月报KEY
const EXPORT_QUEUE_MONTH_KEY = 'queue_month_';

class AdminExportService extends BaseAdminService {
	// #####################导出报名数据
	/**获取报名数据 */
	async getJoinDataURL() {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_JOIN_DATA_KEY);
	}

	/**删除报名数据 */
	async deleteJoinDataExcel() {
		let dataService = new DataService();
		return await dataService.deleteDataExcel(EXPORT_JOIN_DATA_KEY);
	}

	// 根据表单提取数据
	_getValByForm(arr, mark, title) {
		for (let k in arr) {
			if (arr[k].mark == mark) return arr[k].val;
			if (arr[k].title == title) return arr[k].val;
		}

		return '';
	}

	/**导出报名数据 */
	async exportJoinDataExcel({
		meetId,
		startDay,
		endDay,
		status
	}) {
		this.AppError('此功能暂不开放，如有需要请加作者微信：cclinux0730');

	}


	// #####################导出用户数据

	/**获取用户数据 */
	async getUserDataURL() {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_USER_DATA_KEY);
	}

	/**删除用户数据 */
	async deleteUserDataExcel() {
		let dataService = new DataService();
		return await dataService.deleteDataExcel(EXPORT_USER_DATA_KEY);
	}

	/**导出用户数据 */
	async exportUserDataExcel(condition) {

		this.AppError('此功能暂不开放，如有需要请加作者微信：cclinux0730');

	}


	// ##################### 装卸月报 #####################

	/**获取月报下载地址 */
	async getQueueMonthURL(yearMonth) {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_QUEUE_MONTH_KEY + yearMonth);
	}

	/**导出月度经营报表（该月已完成/已取消记录） */
	async exportQueueMonthExcel(yearMonth) {
		let queueService = new QueueService();
		let history = await queueService.historyList(yearMonth);
		let list = history.list || [];

		let header = [
			'状态', '排队号', '车牌号', '业务类型', '货物名称', '备注', '手机号',
			'叉车司机', '接单方式', '费用明细', '总费用(元)', '支付状态',
			'创建时间', '签到时间', '叫号时间', '确认时间', '完成时间',
			'结算时间', '支付时间', '取消时间', '取消原因'
		];

		let rows = [header];
		let feeTotal = 0;
		let paidTotal = 0;

		for (let item of list) {
			let feeText = (item.fees || []).map(f => f.name + '¥' + f.amountText + '(' + f.typeDesc + ')').join('；');
			rows.push([
				item.statusDesc || '',
				item.QUEUE_NO || '',
				item.QUEUE_PLATE || '',
				item.QUEUE_ACTION_NAME || '',
				item.QUEUE_CARGO_NAME || '',
				item.QUEUE_REMARK || '',
				item.QUEUE_PHONE || '',
				item.forkliftName || '',
				item.grabTypeDesc || '',
				feeText,
				item.feeTotalText || '0.00',
				item.payStatusDesc || '',
				item.addTimeText || '',
				item.checkinTimeText || '',
				item.callTimeText || '',
				item.confirmTimeText || '',
				item.finishTimeText || '',
				item.settleTimeText || '',
				item.payTimeText || '',
				item.cancelTimeText || '',
				item.QUEUE_CANCEL_REASON || ''
			]);
			feeTotal += Number(item.feeTotal) || 0;
			if (Number(item.QUEUE_PAY_STATUS) === 1) paidTotal += Number(item.feeTotal) || 0;
		}

		let empty = ['', '', '', '', '', '', '', '', ''];
		rows.push(empty.concat(['', '合计费用(元)', (feeTotal / 100).toFixed(2), '']).concat(['', '', '', '', '', '', '', '', '']));
		rows.push(empty.concat(['', '已支付(元)', (paidTotal / 100).toFixed(2), '']).concat(['', '', '', '', '', '', '', '', '']));

		let dataService = new DataService();
		return await dataService.exportDataExcel(
			EXPORT_QUEUE_MONTH_KEY + yearMonth,
			'装卸经营月报' + yearMonth,
			list.length,
			rows
		);
	}
}

module.exports = AdminExportService;