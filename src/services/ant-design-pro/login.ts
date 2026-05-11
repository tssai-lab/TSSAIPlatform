// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';

/** 发送验证码 POST /api/user/sms/code */
export async function getFakeCaptcha(
  params: {
    /** 手机号 */
    phone?: string;
  },
  options?: { [key: string]: any },
) {
  return request<API.FakeCaptcha>('/user/sms/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      mobile: params.phone,
    },
    skipErrorHandler: true,
    ...(options || {}),
  });
}
