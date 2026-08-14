# 微信支付平台证书目录（*.pem 文件不入库，仅保存在本机/云端）

存放通过微信支付平台证书下载工具（CertificateDownloader）或 `/v3/certificates` 接口
下载的平台证书公钥文件，命名规则：`wechatpay_<证书序列号>.pem`，例如：

```
wechatpay_4DF076AC5A7D968D4A8B0B9C599A74CB4CF8EE8A.pem
```

回调云函数按 HTTP 头 `Wechatpay-Serial` 的序列号选择对应证书验签（官方文档 4013053420）。
证书轮换时新旧证书可同时存放，验签无需停机。

商户 API 证书私钥（apiclient_key.pem）**不要**放这里，配置为 `cloud` 云函数的环境变量
`WXPAY_MCH_PRIVATE_KEY`（PEM 文本，换行可用 `\n` 转义）。
