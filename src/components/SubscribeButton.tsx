import { useEffect, useState } from 'react';

type Lang = 'en' | 'zh';

type Status =
  | 'checking'
  | 'unsupported'
  | 'ios-install-required'
  | 'idle'
  | 'subscribed'
  | 'denied'
  | 'working'
  | 'error';

interface Props {
  lang: Lang;
  vapidKey: string;
}

const T = {
  en: {
    enable: 'Enable daily push',
    disable: 'Disable daily push',
    working: 'Working…',
    denied: 'Notifications blocked. Enable them in browser settings to subscribe.',
    unsupported: 'Web Push is not supported in this browser.',
    iosHint:
      'On iPhone, tap the Share icon → "Add to Home Screen" and open the installed app to enable push.',
    error: 'Something went wrong. Try again.',
    subscribed: 'Subscribed · you\u2019ll get each day\u2019s report',
    promptTitle: 'Get notified when a new report drops',
    promptDesc: 'Web Push on your phone and desktop — one notification per day.',
  },
  zh: {
    enable: '开启每日推送',
    disable: '关闭每日推送',
    working: '处理中…',
    denied: '已禁用通知，请在浏览器设置中开启后再订阅。',
    unsupported: '当前浏览器不支持 Web Push。',
    iosHint:
      'iPhone 用户：点击分享按钮 → "添加到主屏幕"，从桌面打开 App 后再开启推送。',
    error: '出了点问题，请再试一次。',
    subscribed: '已订阅 · 每天收到一条日报提醒',
    promptTitle: '新报告发布时通知我',
    promptDesc: '手机和桌面都能收到，每天最多一条。',
  },
} as const;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document)
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function SubscribeButton({ lang, vapidKey }: Props) {
  const t = T[lang];
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setStatus(isIOS() && !isStandalone() ? 'ios-install-required' : 'unsupported');
        return;
      }

      if (isIOS() && !isStandalone()) {
        setStatus('ios-install-required');
        return;
      }

      try {
        const reg =
          (await navigator.serviceWorker.getRegistration('/')) ??
          (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) setStatus('subscribed');
        else if (Notification.permission === 'denied') setStatus('denied');
        else setStatus('idle');
      } catch (e) {
        console.error('[push] init failed', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    setStatus('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), lang }),
      });
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
      setStatus('subscribed');
    } catch (e) {
      console.error('[push] subscribe failed', e);
      setStatus('error');
    }
  }

  async function unsubscribe() {
    setStatus('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus('idle');
    } catch (e) {
      console.error('[push] unsubscribe failed', e);
      setStatus('error');
    }
  }

  if (status === 'checking') {
    return <div className="h-11" aria-hidden />;
  }

  if (status === 'unsupported') {
    return (
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {t.unsupported}
      </p>
    );
  }

  if (status === 'ios-install-required') {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          background: 'var(--color-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="font-semibold mb-1">{t.promptTitle}</div>
        <p style={{ color: 'var(--color-muted)' }}>{t.iosHint}</p>
      </div>
    );
  }

  const isSubscribed = status === 'subscribed';
  const disabled = status === 'working';

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: 'var(--color-card)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="font-semibold mb-1">{t.promptTitle}</div>
      <p className="text-sm mb-3" style={{ color: 'var(--color-muted)' }}>
        {isSubscribed ? t.subscribed : t.promptDesc}
      </p>
      <button
        type="button"
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={disabled}
        className="w-full h-11 rounded-lg font-medium transition-opacity active:opacity-80 disabled:opacity-50"
        style={{
          background: isSubscribed ? 'transparent' : 'var(--color-accent)',
          color: isSubscribed ? 'var(--color-fg)' : 'white',
          border: isSubscribed
            ? '1px solid var(--color-border)'
            : '1px solid transparent',
        }}
      >
        {status === 'working'
          ? t.working
          : isSubscribed
            ? t.disable
            : t.enable}
      </button>
      {status === 'denied' && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          {t.denied}
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          {t.error}
        </p>
      )}
    </div>
  );
}
