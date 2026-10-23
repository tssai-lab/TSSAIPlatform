import { useEffect, useState } from 'react';
import { useModel, history } from '@umijs/max';
import { Alert, Button, Card, Spin } from 'antd';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import { redirectToLogin } from '@/utils/loginRedirect';
import { annotationUrl } from '@/utils/annotationSso';

export default function AnnotationAuthorize() {
  const { initialState } = useModel('@@initialState');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!initialState?.currentUser) { redirectToLogin({ replace: true }); return; }
    const params = new URLSearchParams(history.location.search);
    const challenge = params.get('challenge') || '';
    const state = params.get('state') || '';
    const destination = annotationUrl();
    if (!destination || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) {
      setError('标注平台授权参数无效，请从标注平台重新进入。'); return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/annotation/v1/auth/tickets', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${storage.get<string>(STORAGE_KEYS.TOKEN) || ''}` },
          body: JSON.stringify({ challenge }),
        });
        const result = await response.json();
        if (response.status === 401) { storage.remove(STORAGE_KEYS.TOKEN); redirectToLogin({ replace: true }); return; }
        if (!response.ok) throw new Error(result.error?.code || '授权失败');
        if (!cancelled) window.location.replace(`${destination}/#/?code=${encodeURIComponent(result.code)}&state=${encodeURIComponent(state)}`);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '连接失败'); }
    })();
    return () => { cancelled = true; };
  }, [initialState?.currentUser]);
  return <Card style={{ maxWidth: 520, margin: '15vh auto' }} title="正在进入自动化标注平台">
    {error ? <Alert type="error" message={error} /> : <Spin tip="校验统一登录身份…"><div style={{ height: 80 }} /></Spin>}
    <Button style={{ marginTop: 20 }} onClick={() => history.replace('/platforms')}>返回平台选择页</Button>
  </Card>;
}
