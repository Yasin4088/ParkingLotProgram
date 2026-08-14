const cloudHelper = require('../../../helper/cloud_helper.js');
const cacheHelper = require('../../../helper/cache_helper.js');
const constants = require('../../../biz/constants.js');

Page({
  data: {
    mode: 'register', // 'register' | 'edit'

    phone: '',
    phoneGot: false,
    manualPhone: '',

    name: '',
    idCard: '',
    licensePlate: '',

    driverLicenseImg: '',
    driverLicenseLocal: '',
    vehicleRegImg: '',
    vehicleRegLocal: '',
    idCardImg: '',
    idCardLocal: '',

    uploadingDriverLicense: false,
    uploadingVehicleReg: false,
    uploadingIdCard: false,

    submitting: false
  },

  onLoad: function (options) {
    let user = cacheHelper.get(constants.CACHE_TOKEN);
    if (!user || !user.id) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    // 编辑模式：预填已有数据
    if (options && options.mode === 'edit') {
      this.setData({ mode: 'edit' });
      this._loadInfo();
    }
  },

  _loadInfo: async function () {
    try {
      let info = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '' });
      if (!info) return;

      let data = {
        phone: info.USER_MOBILE || '',
        phoneGot: !!(info.USER_MOBILE),
        name: info.USER_NAME || '',
        idCard: info.USER_IDCARD || '',
        licensePlate: info.USER_LICENSE_PLATE || '',
      };

      // 证件照已有则显示 cloud fileID（通过 getTempFileURL 获取临时链接预览）
      if (info.USER_DRIVER_LICENSE_IMG) {
        data.driverLicenseImg = info.USER_DRIVER_LICENSE_IMG;
        data.driverLicenseLocal = info.USER_DRIVER_LICENSE_IMG;
      }
      if (info.USER_VEHICLE_REG_IMG) {
        data.vehicleRegImg = info.USER_VEHICLE_REG_IMG;
        data.vehicleRegLocal = info.USER_VEHICLE_REG_IMG;
      }
      if (info.USER_IDCARD_IMG) {
        data.idCardImg = info.USER_IDCARD_IMG;
        data.idCardLocal = info.USER_IDCARD_IMG;
      }

      this.setData(data);
    } catch (err) {
      console.error('加载个人信息失败', err);
    }
  },

  // 微信手机号授权
  onGetPhoneNumber: async function (e) {
    console.log('getPhoneNumber 回调:', JSON.stringify(e.detail));

    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showModal({
        title: '授权结果',
        content: 'errMsg: ' + JSON.stringify(e.detail.errMsg),
        showCancel: false
      });
      return;
    }

    let cloudID = e.detail.cloudID;
    if (!cloudID) {
      wx.showModal({
        title: '授权结果',
        content: '授权成功但未获取到cloudID（需基础库2.7.0+且已开通云开发），请重试',
        showCancel: false
      });
      return;
    }

    try {
      let res = await cloudHelper.callCloudSumbit('driver/getPhoneNumber', { cloudID: cloudID }, { title: '获取中' });
      if (res.data && res.data.success) {
        this.setData({
          phone: res.data.phoneNumber,
          phoneGot: true
        });
        wx.showToast({ title: '已获取手机号', icon: 'success' });
      } else {
        wx.showToast({ title: '获取失败，请重试', icon: 'none' });
      }
    } catch (err) {
      console.error('getPhoneNumber失败', err);
      wx.showModal({
        title: '提示',
        content: '手机号获取失败：' + (err.msg || err.message || '未知错误'),
        showCancel: false
      });
    }
  },

  // 手动输入手机号（开发测试降级方案）
  onManualPhoneConfirm: function () {
    let phone = (this.data.manualPhone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
      return;
    }
    this.setData({
      phone: phone,
      phoneGot: true
    });
    wx.showToast({ title: '已设置手机号', icon: 'success' });
  },

  // 输入框通用处理
  onInput: function (e) {
    let field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // 通用图片上传
  uploadImage: async function (e) {
    let field = e.currentTarget.dataset.field;
    let localField = field + 'Local';
    let uploadingField = this._uploadingField(field);

    let tempFilePaths;
    try {
      let res = await wx.chooseImage({ count: 1, sizeType: ['compressed'] });
      tempFilePaths = res.tempFilePaths;
    } catch (err) {
      return;
    }

    let data = {};
    data[localField] = tempFilePaths[0];
    data[uploadingField] = true;
    this.setData(data);

    try {
      let fileID = await cloudHelper.transTempPicOne(tempFilePaths[0], 'driver/register/', '', false);
      data = {};
      data[field] = fileID;
      data[uploadingField] = false;
      this.setData(data);
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (err) {
      console.error('上传失败', err);
      data = {};
      data[localField] = '';
      data[uploadingField] = false;
      this.setData(data);
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    }
  },

  _uploadingField: function (field) {
    let map = {
      driverLicenseImg: 'uploadingDriverLicense',
      vehicleRegImg: 'uploadingVehicleReg',
      idCardImg: 'uploadingIdCard'
    };
    return map[field] || '';
  },

  // 客户端校验
  _validate: function () {
    let { phoneGot, name, idCard, licensePlate, driverLicenseImg, vehicleRegImg, idCardImg } = this.data;

    if (!phoneGot) {
      wx.showToast({ title: '请先获取手机号', icon: 'none' });
      return false;
    }
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return false;
    }
    if (!/^[一-龥·]{2,20}$/.test(name.trim())) {
      wx.showToast({ title: '请输入正确的姓名（2-20个中文）', icon: 'none' });
      return false;
    }
    if (!idCard || !/^\d{17}[\dXx]$/.test(idCard)) {
      wx.showToast({ title: '请输入正确的18位身份证号', icon: 'none' });
      return false;
    }
    if (!licensePlate || !licensePlate.trim()) {
      wx.showToast({ title: '请输入车牌号', icon: 'none' });
      return false;
    }
    if (!driverLicenseImg) {
      wx.showToast({ title: '请上传驾驶证照片', icon: 'none' });
      return false;
    }
    if (!vehicleRegImg) {
      wx.showToast({ title: '请上传行驶证照片', icon: 'none' });
      return false;
    }
    if (!idCardImg) {
      wx.showToast({ title: '请上传身份证照片', icon: 'none' });
      return false;
    }

    return true;
  },

  // 提交
  submitRegister: async function () {
    if (!this._validate()) return;

    this.setData({ submitting: true });

    let isEdit = this.data.mode === 'edit';
    let route = isEdit ? 'driver/updateInfo' : 'driver/register';
    let title = isEdit ? '保存中' : '提交中';

    try {
      let res = await cloudHelper.callCloudSumbit(route, {
        name: this.data.name.trim(),
        phone: this.data.phone,
        idCard: this.data.idCard,
        licensePlate: this.data.licensePlate.trim(),
        driverLicenseImg: this.data.driverLicenseImg,
        vehicleRegImg: this.data.vehicleRegImg,
        idCardImg: this.data.idCardImg
      }, { title: title });

      if (res.data && res.data.success) {
        // 更新缓存中的用户信息
        let user = cacheHelper.get(constants.CACHE_TOKEN);
        if (user && user.id) {
          user.name = this.data.name.trim();
          user.phone = this.data.phone;
          cacheHelper.set(constants.CACHE_TOKEN, user, 86400);
        }

        wx.showToast({ title: isEdit ? '保存成功' : '注册成功', icon: 'success', duration: 1500 });
        setTimeout(function () {
          wx.redirectTo({ url: '/driver/biz_select' });
        }, 1500);
      }
    } catch (err) {
      console.error(isEdit ? '保存失败' : '注册失败', err);
    } finally {
      this.setData({ submitting: false });
    }
  }
});
