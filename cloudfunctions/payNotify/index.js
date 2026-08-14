/**
 * Notes: 微信支付回调云函数（HTTP 触发 + 定时查单兜底，独立于 cloud 函数——CCMiniCloud 入口对无 route 事件直接报错）
 * HTTP 回调流程（官方文档：回调通知 4012791861、平台证书验签 4013053420、回调解密 4012071382）：
 *   验签（Wechatpay-Timestamp/Nonce/请求体 + 平台证书，SHA256-RSA，时间戳偏差≤5分钟防重放）
 *   → APIv3 密钥 AES-256-GCM 解密 resource.ciphertext
 *   → 校验 appid/mchid/订单金额
 *   → 条件更新 {_id, STATUS:4, OUT_TRADE_NO} → STATUS:5 + 已支付 + 生成排队号（幂等）
 * 应答：验签/业务成功 → HTTP 200 无应答报文；失败 → 5XX + {code:'FAIL'}（微信将按 15s/15s/... 频次重试）
 * 定时兜底（官方建议：商户系统不能仅依赖回调，需结合查单 4012791861 第2.3节）：
 *   云开发控制台给本函数添加定时触发器（建议每5分钟），扫描待缴费在线单做商户订单号查单，
 *   已支付则走与回调相同的落库逻辑，避免回调丢失导致司机付款后不入队。
 * 部署：上传后控制台开启 HTTP 触发（云接入）；环境变量 WXPAY_API_V3_KEY / WXPAY_MCH_ID / WXPAY_APP_ID /
 *   WXPAY_MCH_PRIVATE_KEY（定时查单签名用）/ WXPAY_SERIAL_NO；
 *   平台证书下载后放 certs/wechatpay_<序列号>.pem（可放多张，按 Wechatpay-Serial 选择）
 * 说明：Node.js 非微信支付官方示例语言（官方仅 curl/Java/Go），本文件参考官方 Java SDK 逻辑翻译生成，非官方维护。
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MCH_ID = process.env.WXPAY_MCH_ID || '';
const APP_ID = process.env.WXPAY_APP_ID || '';
const API_V3_KEY = process.env.WXPAY_API_V3_KEY || '';
const MCH_SERIAL_NO = process.env.WXPAY_SERIAL_NO || '';
const MCH_PRIVATE_KEY = (process.env.WXPAY_MCH_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CERTS_DIR = path.join(__dirname, 'certs');
const WXPAY_HOST = 'api.mch.weixin.qq.com';
const TIMESTAMP_TOLERANCE = 300; // 官方建议最多允许5分钟时间偏差（4013053420 第2.1节）

function fail(statusCode, message) {
	return {
		isBase64Encoded: false,
		statusCode,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code: 'FAIL', message })
	};
}

/** 验签通过应答：HTTP 200，无需应答报文（官方 4012791861 第2.2节） */
function success() {
	return {
		isBase64Encoded: false,
		statusCode: 200,
		headers: {},
		body: ''
	};
}

/** HTTP 头大小写不敏感读取（网关可能转小写） */
function getHeader(headers, name) {
	if (!headers) return '';
	let lower = name.toLowerCase();
	for (let k in headers) {
		if (k.toLowerCase() === lower) return headers[k];
	}
	return '';
}

/** 读取本地平台证书：certs/wechatpay_<序列号>.pem → {序列号: PEM} */
function loadCerts() {
	let map = {};
	try {
		let files = fs.readdirSync(CERTS_DIR);
		for (let f of files) {
			let m = f.match(/^wechatpay_(.+)\.pem$/);
			if (!m) continue;
			map[m[1]] = fs.readFileSync(path.join(CERTS_DIR, f), 'utf8');
		}
	} catch (e) {
		console.error('[payNotify] 读取平台证书目录失败：', e);
	}
	return map;
}

/** 回调验签：验签串三行 timestamp\nnonce\nbody\n，SHA256 with RSA（官方 4013053420 第2.2/4节） */
function verifySignature(timestamp, nonce, body, signature, certPem) {
	let message = `${timestamp}\n${nonce}\n${body}\n`;
	let verify = crypto.createVerify('RSA-SHA256');
	verify.update(message, 'utf8');
	return verify.verify(certPem, signature, 'base64');
}

/** AES-256-GCM 解密（官方 4012071382：TAG_LENGTH_BIT=128 即 16 字节，随密文一起 Base64 传输） */
function decryptResource(resource) {
	if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM')
		throw new Error('不支持的加密算法：' + (resource && resource.algorithm));
	let key = Buffer.from(API_V3_KEY, 'utf8');
	let nonce = Buffer.from(resource.nonce || '', 'utf8');
	let aad = Buffer.from(resource.associated_data || '', 'utf8');
	let buf = Buffer.from(resource.ciphertext || '', 'base64');
	let authTag = buf.slice(buf.length - 16);
	let data = buf.slice(0, buf.length - 16);
	let decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
	decipher.setAAD(aad);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 当天 0 点时间戳（云函数运行于东八区，与 cloud 函数 timeUtil 口径一致） */
function todayStart() {
	let d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** 商户订单号查单（官方 4012791859；签名规则 4012365337，仅定时兜底用） */
function queryOrder(outTradeNo) {
	return new Promise((resolve, reject) => {
		let url = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${MCH_ID}`;
		let timestamp = String(Math.floor(Date.now() / 1000));
		let nonceStr = crypto.randomBytes(16).toString('hex');
		let message = `GET\n${url}\n${timestamp}\n${nonceStr}\n\n`;
		let sign = crypto.createSign('RSA-SHA256');
		sign.update(message, 'utf8');
		let authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonceStr}",signature="${sign.sign(MCH_PRIVATE_KEY, 'base64')}",timestamp="${timestamp}",serial_no="${MCH_SERIAL_NO}"`;

		let req = https.request({
			host: WXPAY_HOST,
			path: url,
			method: 'GET',
			timeout: 10000,
			headers: {
				'Accept': 'application/json',
				'Authorization': authorization,
			}
		}, res => {
			let chunks = [];
			res.on('data', c => chunks.push(c));
			res.on('end', () => {
				let text = Buffer.concat(chunks).toString('utf8');
				let json = null;
				try {
					json = JSON.parse(text);
				} catch (e) {}
				if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
				else {
					let err = new Error((json && json.message) || ('查单失败(' + res.statusCode + ')'));
					err.statusCode = res.statusCode;
					err.wxCode = json ? (json.code || '') : '';
					reject(err);
				}
			});
		});
		req.on('timeout', () => req.destroy(new Error('查单超时')));
		req.on('error', reject);
		req.end();
	});
}

/** 支付成功落库（回调与定时查单共用）：金额校验 + 条件更新 4→5 + 生成排队号，幂等
 *  返回：'paid' 本次落库成功 / 'already' 已处理过（幂等，无需动作）/ 'amount_mismatch' 金额不符需人工介入 */
async function markPaid(record, order) {
	if (Number(order.amount && order.amount.total) !== Number(record.STORAGE_FEE_TOTAL)) {
		console.error('[payNotify] 支付金额与费用不符：', order.out_trade_no, order.amount && order.amount.total, record.STORAGE_FEE_TOTAL);
		return 'amount_mismatch';
	}

	let updated = await db.collection('ax_storage').where({
		_id: record._id,
		STORAGE_STATUS: 4,
		STORAGE_PAY_OUT_TRADE_NO: order.out_trade_no
	}).update({
		data: {
			STORAGE_STATUS: 5,
			STORAGE_PAY_STATUS: 1,
			STORAGE_PAY_TIME: order.success_time ? new Date(order.success_time).getTime() : Date.now(),
			STORAGE_PAY_AMOUNT: Number(order.amount && order.amount.total) || 0,
			STORAGE_PAY_TRANSACTION_ID: order.transaction_id || '',
		}
	});

	if (!(updated.stats && updated.stats.updated)) return 'already'; // 已处理过（幂等）

	// 生成排队号（与 storage_service.makeStorageNo 同算法；云函数间无法共享代码，各自维护，改动需同步）
	let cnt = await db.collection('ax_storage').where({
		STORAGE_QUEUE_TIME: _.gte(todayStart())
	}).count();
	let queueNo = String(cnt.total + 1).padStart(3, '0');
	await db.collection('ax_storage').doc(record._id).update({
		data: {
			STORAGE_NO: queueNo,
			STORAGE_QUEUE_TIME: Date.now(),
		}
	});
	return 'paid';
}

/** 定时兜底：扫描待缴费在线单，查单发现已支付则落库入队 */
async function scanUnpaid() {
	if (!MCH_PRIVATE_KEY || !MCH_SERIAL_NO) {
		console.log('[payNotify] 未配置 WXPAY_MCH_PRIVATE_KEY/WXPAY_SERIAL_NO，跳过定时查单');
		return;
	}
	let list = await db.collection('ax_storage').where({
		STORAGE_STATUS: 4,
		STORAGE_PAY_STATUS: 0,
		STORAGE_PAY_MODE: 1,
		STORAGE_PAY_OUT_TRADE_NO: _.neq('')
	}).orderBy('STORAGE_FETCH_TIME', 'asc').limit(20).get();

	for (let record of (list.data || [])) {
		try {
			let order = await queryOrder(record.STORAGE_PAY_OUT_TRADE_NO);
			if (order && order.trade_state === 'SUCCESS') {
				await markPaid(record, order);
			}
		} catch (e) {
			if (e && (e.wxCode === 'ORDER_NOT_EXIST' || e.statusCode === 404)) continue;
			console.error('[payNotify] 定时查单失败：', record.STORAGE_PAY_OUT_TRADE_NO, e.message || e);
		}
	}
}

exports.main = async (event, context) => {
	// 定时触发器（控制台添加，建议每5分钟）
	if (event && event.Type === 'Timer') {
		await scanUnpaid();
		return {};
	}

	try {
		// HTTP 触发事件格式：{path, httpMethod, headers, queryStringParameters, body, isBase64Encoded}
		let body = event.isBase64Encoded
			? Buffer.from(event.body || '', 'base64').toString('utf8')
			: (event.body || '');

		let timestamp = getHeader(event.headers, 'Wechatpay-Timestamp');
		let nonce = getHeader(event.headers, 'Wechatpay-Nonce');
		let signature = getHeader(event.headers, 'Wechatpay-Signature');
		let serial = getHeader(event.headers, 'Wechatpay-Serial');

		// 时间戳防重放
		if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > TIMESTAMP_TOLERANCE) {
			console.error('[payNotify] 时间戳缺失或过期');
			return fail(401, '时间戳校验失败');
		}

		// 平台证书验签（签名探测流量会被正常验签流程拒绝，无需特判）
		let cert = loadCerts()[serial];
		if (!cert) {
			console.error('[payNotify] 未找到序列号对应的平台证书：', serial);
			return fail(401, '证书不存在');
		}
		if (!verifySignature(timestamp, nonce, body, signature, cert)) {
			console.error('[payNotify] 验签失败（可能为微信签名探测流量）');
			return fail(401, '验签失败');
		}

		let notify = JSON.parse(body);
		if (notify.event_type !== 'TRANSACTION.SUCCESS') {
			return success(); // 非支付成功通知，应答成功停止重试
		}

		let order = JSON.parse(decryptResource(notify.resource));
		if (order.trade_state !== 'SUCCESS') return success();
		if (order.appid !== APP_ID || order.mchid !== MCH_ID) {
			console.error('[payNotify] appid/mchid 不匹配：', order.appid, order.mchid);
			return fail(500, '商户信息不匹配');
		}

		let outTradeNo = order.out_trade_no || '';
		let recordRes = await db.collection('ax_storage').where({
			STORAGE_PAY_OUT_TRADE_NO: outTradeNo
		}).limit(1).get();
		if (!recordRes.data || !recordRes.data.length) {
			// 孤儿订单（正常流程回调到达前订单号必已落库）：应答成功，避免无意义重试
			console.error('[payNotify] 未找到订单号对应记录：', outTradeNo);
			return success();
		}

		let result = await markPaid(recordRes.data[0], order);
		if (result === 'amount_mismatch') {
			// 金额不符 → 5XX 让微信重试，等待人工介入
			return fail(500, '金额校验失败');
		}
		// 'paid' 与 'already'（重复通知幂等）均应答成功
		return success();
	} catch (e) {
		console.error('[payNotify] 处理失败：', e);
		return fail(500, '处理失败');
	}
};
