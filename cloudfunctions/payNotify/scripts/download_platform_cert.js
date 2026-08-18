/**
 * Notes: 微信支付「下载平台证书」脚本（官方 API：GET /v3/certificates，文档 4012551764）
 * 用途：商户平台网页已不提供平台证书下载（只有序列号展示），本脚本用商户API证书私钥
 *       签名请求官方接口，把平台证书解密后写入 ../certs/wechatpay_<序列号>.pem，
 *       供 payNotify 回调验签使用。零依赖（仅 Node 内置模块），本机直接运行。
 * 注意：新商户（无平台证书）调用该接口会返回「无可用的平台证书，请申请使用微信支付公钥」，
 *       此时改用微信支付公钥验签：商户平台-账户中心-API安全 申请并下载公钥，
 *       文件命名为 ../certs/wechatpay_<PUB_KEY_ID_数字串>.pem（ID 下载页可见，见 certs/README.md）。
 * 敏感参数只从环境变量读取，脚本本身不含任何密钥，也不写入仓库。
 *
 * 运行（PowerShell，先设环境变量）：
 *   $env:WXPAY_MCH_ID="你的商户号"
 *   $env:WXPAY_SERIAL_NO="商户API证书序列号（商户平台 API安全 页可查）"
 *   $env:WXPAY_MCH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"  # 换行可用 \n 转义
 *   $env:WXPAY_API_V3_KEY="APIv3密钥（32位）"
 *   node cloudfunctions/payNotify/scripts/download_platform_cert.js
 *
 * 输出：../certs/wechatpay_<序列号>.pem（多张证书会全部落盘，文件名按序列号区分）
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MCH_ID = process.env.WXPAY_MCH_ID || '';
const MCH_SERIAL_NO = process.env.WXPAY_SERIAL_NO || '';
const API_V3_KEY = process.env.WXPAY_API_V3_KEY || '';
const MCH_PRIVATE_KEY = (process.env.WXPAY_MCH_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const WXPAY_HOST = 'api.mch.weixin.qq.com';
const CERTS_PATH = '/v3/certificates';
const CERTS_DIR = path.join(__dirname, '..', 'certs');

function need(name) {
	if (!process.env[name]) {
		console.error(`缺少环境变量 ${name}`);
		process.exit(1);
	}
}

/** 签名并请求 GET /v3/certificates（签名规则与 wxpay_lib.js 完全一致，官方 4012365337） */
function requestCertificates() {
	return new Promise((resolve, reject) => {
		let timestamp = String(Math.floor(Date.now() / 1000));
		let nonceStr = crypto.randomBytes(16).toString('hex');
		let message = `GET\n${CERTS_PATH}\n${timestamp}\n${nonceStr}\n\n`;
		let sign = crypto.createSign('RSA-SHA256');
		sign.update(message, 'utf8');
		let authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonceStr}",signature="${sign.sign(MCH_PRIVATE_KEY, 'base64')}",timestamp="${timestamp}",serial_no="${MCH_SERIAL_NO}"`;

		let req = https.request({
			host: WXPAY_HOST,
			path: CERTS_PATH,
			method: 'GET',
			timeout: 15000,
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'parking-lot/1.0',
				'Authorization': authorization,
			}
		}, res => {
			let chunks = [];
			res.on('data', c => chunks.push(c));
			res.on('end', () => {
				let text = Buffer.concat(chunks).toString('utf8');
				console.log('HTTP', res.statusCode, 'Request-Id=' + (res.headers['request-id'] || ''));
				let json = null;
				try { json = JSON.parse(text); } catch (e) {}
				if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
				else reject(new Error((json && json.message) || ('请求失败(' + res.statusCode + ')：' + text.slice(0, 500))));
			});
		});
		req.on('timeout', () => req.destroy(new Error('请求超时')));
		req.on('error', reject);
		req.end();
	});
}

/** AES-256-GCM 解密（与 payNotify/index.js decryptResource 一致，官方 4012071382） */
function decrypt(encryptCert) {
	let key = Buffer.from(API_V3_KEY, 'utf8');
	let nonce = Buffer.from(encryptCert.nonce || '', 'utf8');
	let aad = Buffer.from(encryptCert.associated_data || '', 'utf8');
	let buf = Buffer.from(encryptCert.ciphertext || '', 'base64');
	let authTag = buf.slice(buf.length - 16);
	let data = buf.slice(0, buf.length - 16);
	let decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
	decipher.setAAD(aad);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

(async () => {
	need('WXPAY_MCH_ID');
	need('WXPAY_SERIAL_NO');
	need('WXPAY_MCH_PRIVATE_KEY');
	need('WXPAY_API_V3_KEY');

	fs.mkdirSync(CERTS_DIR, { recursive: true });

	let body = await requestCertificates();
	let list = (body && body.data) || [];
	if (!list.length) {
		console.error('接口未返回任何平台证书：', JSON.stringify(body));
		process.exit(1);
	}

	for (let item of list) {
		if (!item.serial_no || !item.encrypt_certificate) continue;
		let pem = decrypt(item.encrypt_certificate);
		let file = path.join(CERTS_DIR, `wechatpay_${item.serial_no}.pem`);
		fs.writeFileSync(file, pem, 'utf8');
		console.log(`已保存平台证书 → ${file}`);
		console.log(`  序列号: ${item.serial_no}  有效期: ${item.effective_time || ''} ~ ${item.expire_time || ''}`);
	}
	console.log('完成。将 certs/ 目录随 payNotify 一起上传部署即可用于回调验签。');
})().catch(e => {
	let msg = (e && e.message) || String(e);
	console.error('下载失败：', msg);
	if (msg.includes('微信支付公钥') || msg.includes('RESOURCE_NOT_EXISTS')) {
		console.error('\n说明：该商户号没有平台证书（新商户默认），请改用微信支付公钥验签：');
		console.error('  商户平台 → 账户中心 → API安全 → 微信支付公钥 → 申请并下载公钥文件；');
		console.error('  下载页会展示公钥ID（形如 PUB_KEY_ID_数字串），把文件命名为');
		console.error('  cloudfunctions/payNotify/certs/wechatpay_<公钥ID>.pem 即可（详见 certs/README.md）。');
	}
	process.exit(1);
});
