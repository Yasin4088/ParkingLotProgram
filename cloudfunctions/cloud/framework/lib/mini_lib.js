/**
 * Notes: 小程序封装类库
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2020-09-06 14:00:00 
 */
const cloudBase = require('../cloud/cloud_base.js');
const cloudUtil = require('../cloud/cloud_util.js');
const config = require('../../config/config');
 

// 消息长度截取
function fmtThing(str) { //20个以内字符,可汉字、数字、字母或符号组合
	return str.substr(0, 20);
}

function fmtCharacterString(str) { //32位以内数字、字母或符号
	return str.substr(0, 32);
}

function fmtPhrase(str) { //5个以内汉字
	return str.substr(0, 5);
}

 

/**
 * 订阅消息发送结果入库（诊断用）：写 ax_log 集合，控制台日志不可见时也能在数据库排查
 * @param {*} key 业务标识（queue_call/queue_cancel）
 * @param {*} body 发送体（touser/template_id）
 * @param {*} errCode 0=成功，其他=微信错误码
 * @param {*} errMsg 错误信息
 */
async function logSendDiag(key, body, errCode = 0, errMsg = '') {
	try {
		let db = cloudBase.getCloud().database();
		await db.collection('ax_log').add({
			data: {
				LOG_TYPE: 'SUBSCRIBE_SEND',
				LOG_TITLE: String(key || '').slice(0, 50),
				LOG_OPENID: (body && body.touser) || '',
				LOG_TEMPLATE_ID: (body && body.template_id) || '',
				LOG_ERR_CODE: Number(errCode) || 0,
				LOG_ERR_MSG: String(errMsg || '').slice(0, 300),
				LOG_ADD_TIME: Date.now(),
			}
		});
	} catch (e) {
		console.log('##logSendDiag 写入失败', e && e.message);
	}
}

/**
 * 发送一次性消息
 * @param {*} body 
 * @param {*} key 
 */
async function sendMiniOnceTempMsg(body, key = '') {
	let cloud = cloudBase.getCloud();
	try {
		// 默认参数
		body.lang = 'zh_CN';
		body.miniprogramState = 'formal';

		let res = await cloud.openapi.subscribeMessage.send(body);
		// 诊断日志（普通日志可见）：发送成功也打点，便于排查订阅消息未触达
		console.log('##sendOnceTempMsg[' + key + '] 发送成功', 'touser=' + body.touser, 'res=' + JSON.stringify(res));
		await logSendDiag(key, body, 0, '发送成功');
	} catch (err) {
		console.log('##sendOnceTempMsg[' + key + '] 发送失败', err.errCode, err.errMsg, JSON.stringify(err));
		cloudUtil.log('##sendOnceTempMsg[' + key + ']', err);
		await logSendDiag(key, body, err.errCode, err.errMsg || String(err));
	}
}
module.exports = {
	sendMiniOnceTempMsg, 
	logSendDiag,

	fmtThing,
	fmtCharacterString,
	fmtPhrase
}