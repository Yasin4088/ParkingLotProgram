# 微信支付回调验签密钥目录（*.pem 文件不入库，仅保存在本机/云端）

存放回调验签密钥文件（**平台证书** 或 **微信支付公钥**，二选一），命名规则
`wechatpay_<序列号>.pem`，文件名与回调 HTTP 头 `Wechatpay-Serial` 完全一致，
`payNotify/index.js` 的 `loadCerts()` 按该头选择对应文件验签（官方文档 4013053420 / 4015164042）。

## 方式一：微信支付公钥（新商户默认，推荐）

新商户在 `GET /v3/certificates` 会返回「无可用的平台证书，请在商户平台-API安全申请使用微信支付公钥」，
即**没有平台证书**，改用微信支付公钥验签（一次申请永久有效，无 5 年有效期）。

- 申请下载：商户平台 pay.weixin.qq.com → 账户中心 → API安全 → 微信支付公钥 → 申请并下载
- 公钥序列号固定为 `PUB_KEY_ID_数字串` 格式（例如 `PUB_KEY_ID_3000000001`），下载页会展示该 ID
- 文件名：`wechatpay_<PUB_KEY_ID>.pem`，例如：

```
wechatpay_PUB_KEY_ID_3000000001.pem
```

## 方式二：平台证书（老商户）

- 下载：商户平台 → 账户中心 → API安全 → 平台证书（新版网页仅展示序列号无下载按钮时，
  用「微信支付商家助手」小程序下载，或运行 `scripts/download_platform_cert.js` 调 `/v3/certificates` 接口）
- 文件名：`wechatpay_<证书序列号>.pem`，例如：

```
wechatpay_4DF076AC5A7D968D4A8B0B9C599A74CB4CF8EE8A.pem
```

## 其他说明

- 密钥轮换/更新时新旧文件可同时存放，验签无需停机（按 Wechatpay-Serial 选择）。
- 商户 API 证书私钥（apiclient_key.pem）**不要**放这里，配置为 `cloud` 云函数的环境变量
  `WXPAY_MCH_PRIVATE_KEY`（PEM 文本，换行可用 `\n` 转义）。
