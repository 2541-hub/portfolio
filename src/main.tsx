import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { supabase } from './supabase';

// 網站啟動前先向 Supabase 讀你改過嘅內容，放喺 window.__CLOUD_CONTENT__，App.tsx 會優先用佢。
// 只喺兩次明確請求失敗後先用 works.json，避免網絡暫時慢就錯誤顯示舊內容。
const CONTENT_REQUEST_TIMEOUT_MS = 10_000;
const CONTENT_REQUEST_ATTEMPTS = 2;

const isSiteContent = (content: any) =>
  content && Array.isArray(content.categories) && Array.isArray(content.projects);

async function loadCloudContent() {
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
      return;
    } catch (err) {
      lastError = err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  console.warn('兩次讀取雲端內容都失敗，改用 works.json', lastError);
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

async function start() {
  const root = createRoot(document.getElementById('root')!);

  // 網址最後加 #admin 就會打開管理頁，其他人睇到登入框但冇帳戶登入唔到
  if (window.location.hash === '#admin') {
    const { default: Admin } = await import('./Admin');
    root.render(
      <StrictMode>
        <Admin />
      </StrictMode>
    );
    return;
  }

  enableLightProtection(); // 只喺主網站開，管理頁唔受影響
  await loadCloudContent();
  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

start();
