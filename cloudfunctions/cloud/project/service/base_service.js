/**
 * Notes: 业务基类 
 * Date: 2021-03-15 04:00:00 
 */

const AppError = require('../../framework/core/app_error.js');
const appCode = require('../../framework/core/app_code.js');
const timeUtil = require('../../framework/utils/time_util.js');
const dbUtil = require('../../framework/database/db_util.js');
const cloudBase = require('../../framework/cloud/cloud_base.js');
const SetupModel = require('../model/setup_model.js');
const NewsModel = require('../model/news_model.js');
const MeetModel = require('../model/meet_model.js');
const config = require('../../config/config.js');

// 集合兜底执行开关（云函数热实例内只检查一次，每次部署后首个请求会重新触发）
let collectionsChecked = false;

class BaseService {
	constructor() {
		// 当前时间戳
		this._timestamp = timeUtil.time();

	}

	/**
	 * 抛出异常
	 * @param {*} msg 
	 * @param {*} code 
	 */
	AppError(msg, code = appCode.LOGIC) {
		throw new AppError(msg, code);
	}

	getProjectId() {
		if (global.PID)
			return global.PID;
		else
			return 'unknow';
	}

	/** 当日发号（事务计数器，防并发撞号）：ax_counter 文档 _id = CNT_{PID}_{prefix}_{day}（确定性 _id 天然幂等）
	 *  当日首个文档创建时以 seedFn()（当日已有记录数，老算法口径）为种子，保证部署当天号码无缝衔接；
	 *  此后每次调用事务内原子自增，返回 3 位补零号码；t 为外部事务对象时可并入同一事务 */
	async nextDayNo(prefix, now, seedFn, t) {
		const db = cloudBase.getCloud().database();
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');

		if (t) {
			return await this._nextDayNoTx(t, prefix, day, seedFn);
		}

		// 并发创建当日计数器文档时事务冲突，自动重试
		for (let i = 0; i < 3; i++) {
			try {
				return await db.runTransaction(tx => this._nextDayNoTx(tx, prefix, day, seedFn));
			} catch (e) {
				if (i === 2) throw e;
			}
		}
	}

	async _nextDayNoTx(t, prefix, day, seedFn) {
		let docId = 'CNT_' + this.getProjectId() + '_' + prefix + '_' + day;
		let doc = null;
		try {
			doc = await t.collection('ax_counter').doc(docId).get();
		} catch (e) {
			doc = null; // 当日首个号码，文档不存在
		}

		let val = 0;
		if (doc && doc.data) {
			val = Number(doc.data.CNT_VAL) + 1;
			await t.collection('ax_counter').doc(docId).update({ data: { CNT_VAL: val } });
		} else {
			// 首次创建：种子=当日已有记录数（老算法口径，只在创建时查一次）
			let baseCnt = seedFn ? (Number(await seedFn()) || 0) : 0;
			val = baseCnt + 1;
			await t.collection('ax_counter').doc(docId).set({
				data: { _pid: this.getProjectId(), CNT_PREFIX: prefix, CNT_DAY: day, CNT_VAL: val }
			});
		}

		return String(val).padStart(3, '0');
	}


	async initSetup() {
		// 集合兜底：热实例内首次调用补齐配置中缺失的集合。
		// 即使超级管理员早已初始化（ax_setup 非空），新增集合也会在重新部署后的首个请求里自动创建。
		// 探测改为并行：避免冷启动首个请求被串行查询拖到超时（云函数默认超时仅 3 秒）
		if (!collectionsChecked) {
			collectionsChecked = true;
			let arr = config.COLLECTION_NAME.split('|');
			let existsList = await Promise.all(arr.map(name => dbUtil.isExistCollection(name)));
			for (let k in arr) {
				if (!existsList[k]) {
					await dbUtil.createCollection(arr[k]);
				}
			}
		}

		if (await dbUtil.isExistCollection('ax_setup')) {
			let setupCnt = await SetupModel.count({});
			if (setupCnt > 0) return;
		}

		console.log('### initSetup...');

		if (await dbUtil.isExistCollection('ax_news')) {
			let newsCnt = await NewsModel.count({});
			if (newsCnt == 0) {

				// 插入
				let newsArr = config.NEWS_CATE.split(',');
				for (let j in newsArr) {
					let title = newsArr[j].split('=')[1];
					let cateId = newsArr[j].split('=')[0];

					let data = {};
					data.NEWS_TITLE = title + '标题1';
					data.NEWS_DESC = title + '简介1';
					data.NEWS_CATE_ID = cateId;
					data.NEWS_CATE_NAME = title;
					data.NEWS_ADMIN_ID = '1';
					data.NEWS_CONTENT = [{
						type: 'text',
						val: title + '内容1'
					}];
					data.NEWS_PIC = ['../../../../images/default_cover_pic.gif'];

					await NewsModel.insert(data);
				}
			}

		}

		if (await dbUtil.isExistCollection('ax_meet')) {
			let meetCnt = await MeetModel.count({});
			if (meetCnt == 0) {

				// 插入
				let meetArr = config.MEET_TYPE.split(',');
				for (let j in meetArr) {
					let title = meetArr[j].split('=')[1];
					let typeId = meetArr[j].split('=')[0];

					let data = {};
					data.MEET_TITLE = title + '标题1';
					data.MEET_STYLE_SET = {
						desc: title + '简介1',
						pic: '../../../../images/default_cover_pic.gif'
					};
					data.MEET_TYPE_ID = typeId;
					data.MEET_TYPE_NAME = title;
					data.MEET_ADMIN_ID = '1';
					data.MEET_CONTENT = [{
						type: 'text',
						val: title + '内容1'
					}];
					data.MEET_DAYS = [];
					data.MEET_FORM_SET = [{
							type: 'line',
							title: '姓名',
							desc: '请填写您的姓名',
							must: true,
							len: 50,
							onlySet: {
								mode: 'all',
								cnt: -1
							},
							selectOptions: ['', ''],
							mobileTruth: true,
							checkBoxLimit: 2,
						},
						{
							type: 'line',
							title: '手机',
							desc: '请填写您的手机号码',
							must: true,
							len: 50,
							onlySet: {
								mode: 'all',
								cnt: -1
							},
							selectOptions: ['', ''],
							mobileTruth: true,
							checkBoxLimit: 2,
						}
					];

					await MeetModel.insert(data);
				}
			}

		}

		if (await dbUtil.isExistCollection('ax_setup')) {
			let setupCnt = await SetupModel.count({});
			if (setupCnt == 0) {
				let data = {};
				data.SETUP_ABOUT = '关于我们';
				await SetupModel.insert(data);
			}
		}
	}

}

module.exports = BaseService;