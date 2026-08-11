const AdminBiz = require('../../../../biz/admin_biz.js');
const pageHelper = require('../../../../helper/page_helper.js');
const cloudHelper = require('../../../../helper/cloud_helper.js');
const bizHelper = require('../../../../biz/biz_helper.js');

Page({

    data: {
        isLoad: false,
        id: null,
        name: '',
        password: '',
        phone: '',
        type: 0,
        status: 1,
        typeItems: [
            { label: '普通管理员', val: 0 },
            { label: '超级管理员', val: 1 },
        ],
        statusItems: [
            { label: '启用', val: 1 },
            { label: '禁用', val: 0 },
        ],
        typeIndex: 0,
        statusIndex: 0,
        submitting: false,
    },

    onLoad: async function (options) {
        if (!AdminBiz.isAdmin(this)) return;

        pageHelper.getOptions(this, options);

        let id = this.data.id;
        if (id) {
            wx.setNavigationBarTitle({ title: '编辑管理员' });
            await this._loadDetail(id);
        }
        this.setData({ isLoad: true });
    },

    _loadDetail: async function (id) {
        try {
            let admin = await cloudHelper.callCloudData('admin/admin_detail', { id }, { title: 'bar' });
            if (admin) {
                let typeIndex = this.data.typeItems.findIndex(item => item.val === admin.ADMIN_TYPE);
                let statusIndex = this.data.statusItems.findIndex(item => item.val === admin.ADMIN_STATUS);
                this.setData({
                    name: admin.ADMIN_NAME || '',
                    phone: admin.ADMIN_PHONE || '',
                    type: admin.ADMIN_TYPE !== undefined ? admin.ADMIN_TYPE : 0,
                    status: admin.ADMIN_STATUS !== undefined ? admin.ADMIN_STATUS : 1,
                    typeIndex: typeIndex >= 0 ? typeIndex : 0,
                    statusIndex: statusIndex >= 0 ? statusIndex : 0,
                });
            }
        } catch (e) {
            console.log(e);
        }
    },

    bindNameInput: function (e) {
        this.setData({ name: e.detail.value });
    },

    bindPasswordInput: function (e) {
        this.setData({ password: e.detail.value });
    },

    bindPhoneInput: function (e) {
        this.setData({ phone: e.detail.value });
    },

    bindTypeChange: function (e) {
        let index = Number(e.detail.value);
        this.setData({
            typeIndex: index,
            type: this.data.typeItems[index].val,
        });
    },

    bindStatusChange: function (e) {
        let index = Number(e.detail.value);
        this.setData({
            statusIndex: index,
            status: this.data.statusItems[index].val,
        });
    },

    bindSubmitTap: async function () {
        if (this.data.submitting) return;

        let name = this.data.name.trim();
        let password = this.data.password.trim();
        let phone = this.data.phone.trim();
        let id = this.data.id;
        let type = this.data.type;
        let status = this.data.status;

        if (!name || name.length < 2) return wx.showToast({ title: '管理员名至少2位', icon: 'none' });

        if (!id && (!password || password.length < 4)) {
            return wx.showToast({ title: '密码至少4位', icon: 'none' });
        }

        this.setData({ submitting: true });
        try {
            if (id) {
                await cloudHelper.callCloudSumbit('admin/admin_edit', {
                    id: id,
                    name: name,
                    phone: phone,
                    type: type,
                    status: status,
                }, { title: '保存中' });
                wx.showToast({ title: '修改成功', icon: 'success', duration: 1500 });
            } else {
                await cloudHelper.callCloudSumbit('admin/admin_insert', {
                    name: name,
                    password: password,
                    phone: phone,
                    type: type,
                    status: status,
                }, { title: '添加中' });
                wx.showToast({ title: '添加成功', icon: 'success', duration: 1500 });
            }

            bizHelper.removeCacheList('admin-mgr-admin');

            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
        } catch (e) {
            console.log(e);
        } finally {
            this.setData({ submitting: false });
        }
    },

});