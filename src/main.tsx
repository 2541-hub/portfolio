import { Component, StrictMode, useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { supabase } from './supabase';

// 網站啟動前先向 Supabase 讀你改過嘅內容，放喺 window.__CLOUD_CONTENT__，App.tsx 會優先用佢。
// 讀唔到雲端內容就顯示「加載失敗」提示，唔會顯示舊嘅示範內容。
const CONTENT_REQUEST_TIMEOUT_MS = 10_000;
const CONTENT_REQUEST_ATTEMPTS = 2;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const screen: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: '#0a0a0a',
  color: '#777',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
};

const isSiteContent = (content: any) =>
  content && Array.isArray(content.categories) && Array.isArray(content.projects);

// 成功讀到雲端內容回傳 true；兩次都失敗回傳 false
async function loadCloudContent(): Promise<boolean> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CONTENT_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONTENT_REQUEST_TIMEOUT_MS);

    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('data')
        .eq('id', 'works')
        .maybeSingle()
        .abortSignal(controller.signal);

      if (error) throw error;

      const cloud = data?.data;
      if (!isSiteContent(cloud)) throw new Error('雲端內容格式無效');

      (window as any).__CLOUD_CONTENT__ = cloud;
      return true;
    } catch (err) {
      lastError = err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  console.warn('兩次讀取雲端內容都失敗', lastError);
  return false;
}

// 輕量防護：圖片同影片唔可以拖走、右鍵唔出「另存」。只擋隨手另存，擋唔到截圖。
function enableLightProtection() {
  const isMedia = (target: EventTarget | null) =>
    target instanceof HTMLImageElement || target instanceof HTMLVideoElement;

  // 滑鼠位置底下只要有圖或者影片（就算上面蓋住一層半透明遮罩，例如系列封面），都唔出右鍵選單
  document.addEventListener('contextmenu', (e) => {
    if (isMedia(e.target) || document.elementsFromPoint(e.clientX, e.clientY).some(isMedia)) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    if (isMedia(e.target)) e.preventDefault();
  });
}

// 進度條用嘅圖：分類預覽圖同系列封面，最多 14 張
function collectImages(content: any): string[] {
  const urls: string[] = [];
  (content.categories || []).forEach((c: any) => c?.preview && urls.push(c.preview));
  (content.projects || []).forEach((p: any) => p?.thumb && urls.push(p.thumb));
  return Array.from(new Set(urls)).slice(0, 14);
}

function preloadImages(urls: string[], onStep: (done: number, total: number) => void): Promise<void> {
  const total = urls.length;
  if (total === 0) return Promise.resolve();
  let done = 0;
  return new Promise((resolve) => {
    urls.forEach((url) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        done += 1;
        onStep(done, total);
        if (done === total) resolve();
      };
      const img = new Image();
      img.onload = finish;
      img.onerror = finish; // 單張圖載入失敗，唔當成成個網站失敗
      window.setTimeout(finish, 8000);
      img.src = url;
    });
  });
}

const FAIL_CSS = `
.lf-root{position:fixed;inset:0;z-index:9999;background:#050505;color:#e8e6e1;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.lf-glow{position:absolute;inset:-20%;pointer-events:none;background:radial-gradient(ellipse 28% 22% at 63% 24%,rgba(120,112,98,.28),transparent 70%),radial-gradient(ellipse 34% 20% at 44% 64%,rgba(150,140,120,.26),transparent 70%),radial-gradient(ellipse 60% 45% at 50% 52%,rgba(90,86,78,.14),transparent 75%);filter:blur(30px);animation:lf-breathe 7s ease-in-out infinite}
@keyframes lf-breathe{0%,100%{opacity:.65;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
.lf-title{position:relative;margin:0;padding-left:.5em;font-weight:200;font-size:clamp(26px,4.4vw,58px);letter-spacing:.5em;text-transform:uppercase}
.lf-sub{position:relative;margin:28px 0 0;padding-left:.38em;font-size:clamp(9px,1.1vw,13px);font-weight:300;letter-spacing:.38em;color:#a09d95;text-transform:uppercase}
.lf-btn{position:relative;margin-top:72px;background:none;border:0;color:#e8e6e1;cursor:pointer;font-family:inherit;font-size:clamp(12px,1.4vw,16px);font-weight:300;letter-spacing:.45em;padding:14px 8px;display:inline-flex;align-items:center;gap:20px;text-transform:uppercase}
.lf-btn::after{content:'';position:absolute;left:50%;bottom:-2px;width:120px;height:1px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,rgba(235,225,200,.85),transparent);box-shadow:0 0 14px 2px rgba(220,205,170,.25);opacity:.55;transition:opacity .4s,width .4s}
.lf-btn:hover::after,.lf-btn:focus-visible::after{opacity:1;width:170px}
.lf-line{display:inline-block;width:42px;height:1px;background:currentColor;opacity:.7;transition:width .4s}
.lf-btn:hover .lf-line,.lf-btn:focus-visible .lf-line{width:64px}
.lf-btn:focus-visible{outline:none}
.lf-hint{position:relative;margin:40px 0 0;font-size:clamp(8px,.9vw,11px);font-weight:300;letter-spacing:.3em;color:#6f6c66;text-transform:uppercase}
@media (hover:none){.lf-hint{display:none}}
@media (prefers-reduced-motion:reduce){.lf-glow{animation:none}}
`;

// 霧光風格嘅加載失敗畫面：冇邊框，光暈慢慢「呼吸」，RELOAD 靠光線變化表示可以撳
function FailScreen() {
  return (
    <div className="lf-root" role="alert">
      <style>{FAIL_CSS}</style>
      <div className="lf-glow" aria-hidden="true" />
      <h1 className="lf-title">Unable to load</h1>
      <p className="lf-sub">The latest content is currently unavailable</p>
      <button className="lf-btn" onClick={() => window.location.reload()}>
        Reload
        <span className="lf-line" aria-hidden="true" />
      </button>
      <p className="lf-hint">Mac : ⌘ + R &nbsp;&nbsp;|&nbsp;&nbsp; Windows : Ctrl + R</p>
    </div>
  );
}

// 網站運行途中出錯，都顯示重新整理提示，唔會變白頁
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(err);
  }
  render() {
    return this.state.failed ? <FailScreen /> : this.props.children;
  }
}

function Boot() {
  const [target, setTarget] = useState(0); // 真實進度 0–100
  const [shown, setShown] = useState(0); // 畫面顯示嘅進度，慢慢追上真實進度
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let giveUp: number | undefined;
    const arm = () => {
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(() => {
        if (!ready.current && !cancelled) setFailed(true);
      }, 30000);
    };
    arm();

    (async () => {
      try {
        if (!navigator.onLine) throw new Error('offline');

        const ok = await loadCloudContent();
        if (cancelled) return;

        if (!ok) throw new Error('讀取雲端內容失敗'); // 顯示「加載失敗」提示
        setTarget(25);

        const mod = await import('./App');
        if (cancelled) return;
        setTarget(55);

        const content = (window as any).__CLOUD_CONTENT__;
        await preloadImages(collectImages(content), (done, total) => {
          if (!cancelled) setTarget(55 + Math.round((done / total) * 45));
        });
        if (cancelled) return;

        setTarget(100);
        ready.current = true;
        setApp(() => mod.default as ComponentType);
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShown((s) => {
        if (s < target) return Math.min(target, s + Math.max(0.6, (target - s) * 0.12));
        const cap = Math.min(95, target + 8); // 等緊嘅時候慢慢爬，唔會望落似死機
        return s < cap ? s + 0.08 : s;
      });
    }, 30);
    return () => window.clearInterval(timer);
  }, [target]);

  if (failed) return <FailScreen />;
  if (App && shown >= 99.5) {
    return (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  }

  const percent = Math.min(100, Math.floor(shown));
  return (
    <div style={screen}>
      <div style={{ color: '#555' }}>LOADING</div>
      <div style={{ width: 240, height: 1, background: '#222', marginTop: 20, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${percent}%`,
            background: '#e5e5e5',
            transition: 'width 120ms linear',
          }}
        />
      </div>
      <div style={{ marginTop: 16, color: '#999' }}>{percent}%</div>
    </div>
  );
}

function start() {
  const root = createRoot(document.getElementById('root')!);

  // 網址最後加 #admin 就會打開管理頁，其他人睇到登入框但冇帳戶登入唔到
  if (window.location.hash === '#admin') {
    import('./Admin')
      .then(({ default: Admin }) =>
        root.render(
          <StrictMode>
            <Admin />
          </StrictMode>
        )
      )
      .catch(() => root.render(<FailScreen />));
    return;
  }

  enableLightProtection(); // 只喺主網站開，管理頁唔受影響
  root.render(
    <StrictMode>
      <Boot />
    </StrictMode>
  );
}

start();
