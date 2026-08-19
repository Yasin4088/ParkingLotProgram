/**
 * Notes: 微信支付 APIv3 基础支付工具（JSAPI 下单 / 调起支付二次签名 / 商户订单号查单）
 * 说明：Node.js 非微信支付官方示例语言（官方仅 curl/Java/Go），本文件参考官方 Java 示例
 *       （https://pay.weixin.qq.com/doc/v3/merchant/4012791856-java）翻译生成，非官方维护。
 *       签名/验签/解密规则均以官方文档为准：
 *       请求签名（Body 参数）4012365336、请求签名（Query 参数）4012365337、
 *       调起支付签名 4012365339、平台证书验签 4013053420、回调解密 4012071382。
 * 局限：本文件未对微信支付应答做平台证书验签（平台证书仅部署在 payNotify 云函数用于回调验签），
 *       下单/查单应答仅信任 HTTPS 通道，接入后如需严格验签可补。
 */

const crypto = require('crypto');
const https = require('https');
const config = require('../../config/config.js');

const WXPAY_HOST = 'api.mch.weixin.qq.com';
const JSAPI_PATH = '/v3/pay/transactions/jsapi';

class WxPayLib {

	/** 商户API证书私钥（云函数环境变量 WXPAY_MCH_PRIVATE_KEY，PEM 文本，换行可为真实换行或 \n 转义） */
	static getPrivateKey() {
		let key = process.env.WXPAY_MCH_PRIVATE_KEY || '';
		key = key.replace(/\\n/g, '\n');
		if (!key) throw new Error('未配置环境变量 WXPAY_MCH_PRIVATE_KEY（商户API证书私钥）');
		return key;
	}

	/** 请求随机串（官方推荐随机数算法生成，≤32位） */
	static _nonceStr() {
		return crypto.randomBytes(16).toString('hex');
	}

	/** 秒级时间戳（官方要求秒级） */
	static _timestamp() {
		return String(Math.floor(Date.now() / 1000));
	}

	/** SHA256 with RSA 签名 + Base64（官方 4012365336 第3节） */
	static _sign(message) {
		let sign = crypto.createSign('RSA-SHA256');
		sign.update(message, 'utf8');
		return sign.sign(WxPayLib.getPrivateKey(), 'base64');
	}

	/** 构造 Authorization 请求头（官方 4012365336 第4节，五项签名信息无顺序要求） */
	static _buildAuthorization(method, url, bodyStr) {
		let timestamp = WxPayLib._timestamp();
		let nonceStr = WxPayLib._nonceStr();
		let message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;
		let signature = WxPayLib._sign(message);
		return `WECHATPAY2-SHA256-RSA2048 mchid="${config.WXPAY_MCH_ID}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.WXPAY_SERIAL_NO}"`;
	}

	/** HTTPS 请求（bodyStr 与签名时严格一致：官方要求签名串与请求报文主体逐字节相同） */
	static _request(method, url, bodyStr = '') {
		return new Promise((resolve, reject) => {
			let req = https.request({
				host: WXPAY_HOST,
				path: url,
				method,
				timeout: 10000,
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
					'User-Agent': 'parking-lot/1.0',
					'Authorization': WxPayLib._buildAuthorization(method, url, bodyStr),
				}
			}, res => {
				let chunks = [];
				res.on('data', c => chunks.push(c));
				res.on('end', () => {
					let text = Buffer.concat(chunks).toString('utf8');
					// 记录 Request-Id：排障时凭此可让微信支付侧快速定位（官方排障建议）
					console.log('[WXPAY]', method, url, res.statusCode, 'Request-Id=' + (res.headers['request-id'] || ''));
					let json = null;
					try {
						json = JSON.parse(text);
					} catch (e) {}
					if (res.statusCode >= 200 && res.statusCode < 300) {
						resolve({ status: res.statusCode, data: json });
					} else {
						let err = new Error((json && json.message) || ('微信支付接口错误(' + res.statusCode + ')'));
						err.statusCode = res.statusCode;
						err.wxCode = json ? (json.code || '') : '';
						err.requestId = res.headers['request-id'] || '';
						reject(err);
					}
				});
			});
			req.on('timeout', () => req.destroy(new Error('微信支付接口请求超时')));
			req.on('error', e => reject(e));
			if (bodyStr) req.write(bodyStr);
			req.end();
		});
	}

	/** 商户订单号：6-32位，仅数字/字母/_-；prefix+记录ID前20位+'_'+6位随机（官方 4012791856 out_trade_no 规则）
	 *  prefix 区分业务：STOR=存取柜取柜费用, QUE=装卸货费用 */
	static genOutTradeNo(id, prefix = 'STOR') {
		let clean = String(id || '').replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 20);
		return prefix + clean + '_' + crypto.randomBytes(3).toString('hex');
	}

	/** JSAPI/小程序下单，返回 {prepay_id}（官方 4012791856） */
	static async jsapiPrepay({
		outTradeNo,
		description,
		amountTotal,
		payerOpenid,
		notifyUrl
	}) {
		if (!config.WXPAY_MCH_ID || !config.WXPAY_APP_ID || !config.WXPAY_SERIAL_NO)
			throw new Error('微信支付商户参数未配置（WXPAY_MCH_ID/WXPAY_APP_ID/WXPAY_SERIAL_NO）');

		let body = {
			appid: config.WXPAY_APP_ID,
			mchid: config.WXPAY_MCH_ID,
			description: String(description || '').slice(0, 127),
			out_trade_no: outTradeNo,
			notify_url: notifyUrl,
			amount: { total: amountTotal, currency: 'CNY' },
			payer: { openid: payerOpenid },
		};
		let bodyStr = JSON.stringify(body); // 单行报文，签名与请求体严格一致
		let ret = await WxPayLib._request('POST', JSAPI_PATH, bodyStr);
		return ret.data;
	}

	/** 商户订单号查单（官方 4012791859；URL 带 Query 的签名规则 4012365337） */
	static async queryOrder(outTradeNo) {
		let url = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${config.WXPAY_MCH_ID}`;
		let ret = await WxPayLib._request('GET', url, '');
		return ret.data;
	}

	/** 调起支付参数（二次签名，官方 4012365339；signType 不参与签名但需传递） */
	static buildPayParams(prepayId) {
		let appId = config.WXPAY_APP_ID;
		let timeStamp = WxPayLib._timestamp();
		let nonceStr = WxPayLib._nonceStr();
		let packageStr = `prepay_id=${prepayId}`;
		let message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
		return {
			timeStamp,
			nonceStr,
			package: packageStr,
			signType: 'RSA',
			paySign: WxPayLib._sign(message),
		};
	}
}

module.exports = WxPayLib;
