import { Base64 } from 'js-base64';

const aesRawKey = new Uint8Array([
  139, 72, 187, 152, 69, 41, 31, 86, 194, 221, 37, 192, 102, 32, 190, 117, 241, 26, 34, 253, 76, 62, 177, 182, 83, 236,
  173, 157, 25, 41, 28, 8,
]);

const keyPromise = crypto.subtle.importKey('raw', aesRawKey, { name: 'AES-GCM' }, false, ['decrypt', 'encrypt']);

/**
 *  解码请求体
 * @param {string} type 有效值为 base64, aes-256-gcm
 * @param {string} body
 */
export async function decodeBody(type: string, body: string) {
  if (type === 'aes-256-gcm') {
    const key = await keyPromise;

    const parts = body.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const iv = Base64.toUint8Array(parts[0]);
    const data = Base64.toUint8Array(parts[1]);

    const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data).catch(() => null);

    if (!result) {
      return null;
    }

    let string = '';
    try {
      string = new TextDecoder().decode(result);
    } catch (e) {
      return null;
    }

    if (string.charCodeAt(string.length - 1) === 0) {
      string = string.slice(0, -1);
    }

    return JSON.parse(string);
  }

  if (type === 'base64') {
    return JSON.parse(Base64.decode(body));
  }

  return null;
}

/**
 * 编码请求体
 * @param {string} type 有效值为 base64, aes-256-gcm
 * @param {string} body
 */
export async function encodeBody(type: string, body: any) {
  if (type === 'aes-256-gcm') {
    const key = await keyPromise;

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(body));

    const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data).catch(() => null);

    if (!result) {
      return null;
    }

    return `${Base64.fromUint8Array(iv)}.${Base64.fromUint8Array(new Uint8Array(result))}`;
  }

  if (type === 'base64') {
    return Base64.encode(JSON.stringify(body));
  }

  return null;
}
