import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { supabase } from './supabase';

// 網站啟動前先向 Supabase 讀你改過嘅內容，放喺 window.__CLOUD_CONTENT__，App.tsx 會優先用佢。
// 讀唔到（冇網絡、未儲存過、超過 3 秒）就照用 works.json，網站唔會變白頁。
async function loadCloudContent() {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const request = supabase
      .from('site_content')
      .select('data')
      .eq('id', 'works')
      .maybeSingle()
      .then(({ data }) => (data?.data ?? null) as any);
    const cloud = await Promise.race([request, timeout]);
    if (cloud && cloud.categories && cloud.projects) {
      (window as any).__CLOUD_CONTENT__ = cloud;
    }
  } catch (err) {
    console.warn('讀唔到雲端內容，改用 works.json', err);
  }
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

  await loadCloudContent();
  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

start();
