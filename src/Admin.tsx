import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import localWorks from './works.json';

type Category = { id: string; name: string; [key: string]: unknown };
type Project = {
  id?: string;
  category: string;
  title: string;
  type?: string;
  description?: string;
  thumb?: string;
  fit?: string;
  media?: string[];
  [key: string]: unknown;
};
type Content = { categories: Category[]; projects: Project[]; [key: string]: unknown };

const isVideo = (src: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src);

// ARCHIVE 頁嘅文字：key 要同 App.tsx 讀取嘅名一樣，預設值就係而家網站顯示嘅字
const ABOUT_DEFAULTS: Record<string, string> = {
  topLabel: '[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]',
  heading: 'DIGITAL PRODUCER',
  subtitle: 'SYSTEM ARCHITECT / VISUAL DIRECTOR / INTERACTION DESIGNER',
  bio: 'BASED IN STRUCTURAL LOGIC. OPERATING ACROSS MEDIUMS. REDEFINING BOUNDARIES THROUGH CONTROLLED CHAOS.',
  memoryLabel: '[ Deconstructed Memory Bank ]',
};
const ABOUT_FIELDS: [string, string, boolean][] = [
  ['topLabel', '頂部區塊文字', false],
  ['heading', '大標題', false],
  ['subtitle', '副標題', false],
  ['bio', '介紹文字', true],
  ['memoryLabel', '碎片區標題', false],
];

const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work';

// 冇 id 嘅系列補一個，上傳圖片時用嚟分資料夾
function ensureIds(content: Content): Content {
  content.projects.forEach((p, i) => {
    if (!p.id) p.id = `${slug(p.title)}-${i}`;
  });
  return content;
}

// 上傳前自動縮細：最長邊 2400px，轉成 webp。gif、svg、影片原樣上傳。
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

async function uploadFile(file: File, folder: string): Promise<string> {
  const ready = await compressImage(file);
  const ext = (ready.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('works')
    .upload(path, ready, { contentType: ready.type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('works').getPublicUrl(path).data.publicUrl;
}

const page: CSSProperties = {
  minHeight: '100vh',
  background: '#0a0a0a',
  color: '#e5e5e5',
  padding: '32px 24px 96px',
  fontFamily: 'system-ui, -apple-system, "PingFang HK", "Noto Sans TC", sans-serif',
  fontSize: 14,
  lineHeight: 1.6,
  overflowY: 'auto',
  boxSizing: 'border-box',
};
const wrap: CSSProperties = { maxWidth: 760, margin: '0 auto' };
const card: CSSProperties = { background: '#121212', border: '1px solid #242424', padding: 16, marginBottom: 16 };
const input: CSSProperties = {
  display: 'block',
  width: '100%',
  background: '#0a0a0a',
  color: '#eee',
  border: '1px solid #333',
  padding: '8px 10px',
  marginBottom: 10,
  boxSizing: 'border-box',
  fontSize: 14,
  fontFamily: 'inherit',
};
const button: CSSProperties = {
  background: '#e5e5e5',
  color: '#0a0a0a',
  border: 'none',
  padding: '8px 14px',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const ghost: CSSProperties = { ...button, background: 'transparent', color: '#aaa', border: '1px solid #333' };
const label: CSSProperties = { display: 'block', color: '#888', fontSize: 12, marginBottom: 4 };

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [content, setContent] = useState<Content | null>(null);
  const [fromCloud, setFromCloud] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 只喺「登入咗邊個人」改變嗰陣先讀內容。
  // 之前用成個 session 做條件，切換分頁或者 token 自動更新都會令 session 換個新物件，
  // 令內容被重新讀過、畫面閃一閃，仲會蓋走未儲存嘅改動。
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setContent(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('site_content').select('data').eq('id', 'works').maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage('讀取失敗：' + error.message);
        return;
      }
      const base = (data?.data ?? JSON.parse(JSON.stringify(localWorks))) as Content;
      setFromCloud(!!data);
      setContent(ensureIds(base));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const edit = (change: (draft: Content) => void) => {
    setContent((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as Content;
      change(next);
      return next;
    });
    setDirty(true);
  };

  const login = async () => {
    setMessage('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage('登入失敗：' + error.message);
  };

  const save = async () => {
    if (!content) return;
    setBusy(true);
    const { error } = await supabase
      .from('site_content')
      .upsert({ id: 'works', data: content, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      setMessage('儲存失敗：' + error.message);
    } else {
      setMessage('已儲存。回到網站重新整理就會見到新內容。');
      setDirty(false);
      setFromCloud(true);
    }
  };

  const upload = async (index: number, files: FileList | null) => {
    if (!files || !content) return;
    setBusy(true);
    setMessage('上傳緊，請等一等…');
    try {
      const folder = content.projects[index].id || 'misc';
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push(await uploadFile(file, folder));
      edit((c) => {
        const p = c.projects[index];
        p.media = [...(p.media || []), ...urls];
        if (!p.thumb) p.thumb = urls[0];
      });
      setMessage(`上傳咗 ${urls.length} 個檔案。撳「儲存到網站」先會生效。`);
    } catch (err: any) {
      setMessage('上傳失敗：' + (err?.message || String(err)));
    }
    setBusy(false);
  };

  // 直接換封面：只更換封面，唔會加入「作品圖片同影片」
  const uploadCover = async (index: number, files: FileList | null) => {
    if (!files || !files[0] || !content) return;
    setBusy(true);
    setMessage('上傳封面中…');
    try {
      const url = await uploadFile(files[0], `${content.projects[index].id || 'misc'}/cover`);
      edit((c) => {
        c.projects[index].thumb = url;
      });
      setMessage('封面已更換。撳「儲存到網站」先會生效。');
    } catch (err: any) {
      setMessage('上傳失敗：' + (err?.message || String(err)));
    }
    setBusy(false);
  };

  // 換分類嘅預覽圖（INDEX 頁右邊嗰張大圖）
  const uploadCategoryPreview = async (index: number, files: FileList | null) => {
    if (!files || !files[0] || !content) return;
    setBusy(true);
    setMessage('上傳預覽圖中…');
    try {
      const url = await uploadFile(files[0], `categories/${slug(content.categories[index].id)}`);
      edit((c) => {
        c.categories[index].preview = url;
      });
      setMessage('預覽圖已更換。撳「儲存到網站」先會生效。');
    } catch (err: any) {
      setMessage('上傳失敗：' + (err?.message || String(err)));
    }
    setBusy(false);
  };

  // ARCHIVE 頁嘅碎片圖：加新圖，或者換走某一張
  const uploadArchive = async (files: FileList | null, replaceIndex?: number) => {
    if (!files || files.length === 0 || !content) return;
    setBusy(true);
    setMessage('上傳緊，請等一等…');
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push(await uploadFile(file, 'archive'));
      edit((c) => {
        const list = ((c.archive as any[]) || []).slice();
        if (replaceIndex !== undefined) {
          list[replaceIndex] = { ...list[replaceIndex], src: urls[0] };
        } else {
          urls.forEach((src) => list.push({ src, w: 280 }));
        }
        c.archive = list;
      });
      setMessage('ARCHIVE 圖片已更新。撳「儲存到網站」先會生效。');
    } catch (err: any) {
      setMessage('上傳失敗：' + (err?.message || String(err)));
    }
    setBusy(false);
  };

  const addProject = () =>
    edit((c) => {
      c.projects.push({
        id: `work-${Date.now().toString(36)}`,
        category: c.categories[0]?.id || '',
        title: 'NEW WORK',
        type: '',
        description: '',
        thumb: '',
        fit: 'cover',
        media: [],
      });
    });

  const removeProject = (index: number) => {
    if (!content) return;
    if (!window.confirm(`確定刪除「${content.projects[index].title}」？儲存之後網站就會冇咗佢。`)) return;
    edit((c) => {
      c.projects.splice(index, 1);
    });
  };

  if (!ready) return <div style={page}>載入中…</div>;

  if (!session) {
    return (
      <div style={page}>
        <form
          style={{ ...wrap, maxWidth: 360, paddingTop: 80 }}
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 400, marginBottom: 24 }}>登入管理頁</h1>
          <label style={label}>電郵</label>
          <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <label style={label}>密碼</label>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button style={button} type="submit" disabled={busy}>
            {busy ? '登入緊…' : '登入'}
          </button>
          {message && <p style={{ color: '#e08a8a', marginTop: 16 }}>{message}</p>}
          <p style={{ marginTop: 32 }}>
            <a href="/" style={{ color: '#777' }}>
              回到網站
            </a>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>管理作品</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/" style={{ ...ghost, textDecoration: 'none' }}>
              回到網站
            </a>
            <button style={ghost} onClick={() => supabase.auth.signOut()}>
              登出
            </button>
          </div>
        </div>
        <p style={{ color: '#777', marginTop: 0 }}>
          {session.user.email}
          {content && !fromCloud && '　目前顯示嘅係 works.json 嘅內容，儲存之後就會改用雲端版本。'}
        </p>

        {!content ? (
          <p>讀取內容中…</p>
        ) : (
          <>
            <div style={card}>
              <h2 style={{ fontSize: 16, fontWeight: 400, marginTop: 0 }}>分類名稱</h2>
              {content.categories.map((cat, i) => (
                <div key={cat.id}>
                  <label style={label}>{cat.id}</label>
                  <input
                    style={input}
                    value={cat.name}
                    onChange={(e) =>
                      edit((c) => {
                        c.categories[i].name = e.target.value;
                      })
                    }
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    {typeof cat.preview === 'string' && cat.preview && (
                      <img
                        src={cat.preview}
                        alt="預覽圖"
                        style={{ width: 96, height: 60, objectFit: 'cover', background: '#000' }}
                      />
                    )}
                    <div>
                      <span style={{ ...label, marginBottom: 4 }}>更換預覽圖</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        onChange={(e) => {
                          uploadCategoryPreview(i, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <h2 style={{ fontSize: 16, fontWeight: 400, marginTop: 0 }}>ARCHIVE 頁文字</h2>
              {ABOUT_FIELDS.map(([key, name, multiline]) => {
                const value = ((content.about as Record<string, string> | undefined) || {})[key] ?? ABOUT_DEFAULTS[key];
                const change = (next: string) =>
                  edit((c) => {
                    c.about = { ...((c.about as object) || {}), [key]: next };
                  });
                return (
                  <div key={key}>
                    <label style={label}>{name}</label>
                    {multiline ? (
                      <textarea
                        style={{ ...input, minHeight: 72, resize: 'vertical' }}
                        value={value}
                        onChange={(e) => change(e.target.value)}
                      />
                    ) : (
                      <input style={input} value={value} onChange={(e) => change(e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>

            <div style={card}>
              <h2 style={{ fontSize: 16, fontWeight: 400, marginTop: 0 }}>
                ARCHIVE 碎片圖（{((content.archive as any[]) || []).length}）
              </h2>
              <p style={{ color: '#777', marginTop: 0 }}>寬度係畫面上顯示嘅像素，數字越大圖越大。</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                {((content.archive as any[]) || []).map((frag, k) => (
                  <div key={(frag.src || '') + k} style={{ width: 140 }}>
                    <img
                      src={frag.src}
                      alt=""
                      style={{ width: 140, height: 140, objectFit: 'cover', background: '#000', display: 'block' }}
                    />
                    <label style={{ ...label, marginTop: 6 }}>寬度</label>
                    <input
                      style={{ ...input, marginBottom: 6 }}
                      type="number"
                      min={60}
                      value={frag.w ?? 280}
                      onChange={(e) =>
                        edit((c) => {
                          (c.archive as any[])[k].w = Number(e.target.value) || 280;
                        })
                      }
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <label style={{ ...ghost, padding: '4px 6px', fontSize: 12 }}>
                        換圖
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={busy}
                          onChange={(e) => {
                            uploadArchive(e.target.files, k);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        style={{ ...ghost, padding: '4px 6px', fontSize: 12 }}
                        onClick={() =>
                          edit((c) => {
                            c.archive = ((c.archive as any[]) || []).filter((_, n) => n !== k);
                          })
                        }
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <span style={{ ...label, marginBottom: 4 }}>加新圖（可以一次揀幾張）</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={(e) => {
                  uploadArchive(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {content.projects.map((p, i) => (
              <div key={p.id || i} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 400, margin: 0 }}>{p.title || '（未有標題）'}</h2>
                  <button style={ghost} onClick={() => removeProject(i)}>
                    刪除系列
                  </button>
                </div>

                <label style={label}>標題</label>
                <input
                  style={input}
                  value={p.title}
                  onChange={(e) =>
                    edit((c) => {
                      c.projects[i].title = e.target.value;
                    })
                  }
                />

                <label style={label}>類型同年份</label>
                <input
                  style={input}
                  value={p.type || ''}
                  onChange={(e) =>
                    edit((c) => {
                      c.projects[i].type = e.target.value;
                    })
                  }
                />

                <label style={label}>簡介</label>
                <textarea
                  style={{ ...input, minHeight: 64, resize: 'vertical' }}
                  value={p.description || ''}
                  onChange={(e) =>
                    edit((c) => {
                      c.projects[i].description = e.target.value;
                    })
                  }
                />

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={label}>分類</label>
                    <select
                      style={input}
                      value={p.category}
                      onChange={(e) =>
                        edit((c) => {
                          c.projects[i].category = e.target.value;
                        })
                      }
                    >
                      {content.categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={label}>圖片顯示方式</label>
                    <select
                      style={input}
                      value={p.fit || 'cover'}
                      onChange={(e) =>
                        edit((c) => {
                          c.projects[i].fit = e.target.value;
                        })
                      }
                    >
                      <option value="cover">填滿畫框（可能裁切）</option>
                      <option value="natural">完整顯示（唔裁切）</option>
                    </select>
                  </div>
                </div>

                <label style={label}>封面</label>
                {p.thumb ? (
                  <img src={p.thumb} alt="封面" style={{ height: 96, display: 'block', marginBottom: 12, background: '#000' }} />
                ) : (
                  <p style={{ color: '#777', marginTop: 0 }}>未有封面，可以直接上傳一張。</p>
                )}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ ...label, marginBottom: 4 }}>更換封面（只換封面，唔會加入作品圖片）</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => {
                      uploadCover(i, e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                <label style={label}>作品圖片同影片（{(p.media || []).length}）</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {(p.media || []).map((src, m) => (
                    <div key={src + m} style={{ width: 120 }}>
                      {isVideo(src) ? (
                        <video src={src} muted style={{ width: 120, height: 120, objectFit: 'cover', background: '#000' }} />
                      ) : (
                        <img src={src} alt="" style={{ width: 120, height: 120, objectFit: 'cover', background: '#000' }} />
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button
                          style={{ ...ghost, padding: '4px 6px', fontSize: 12 }}
                          onClick={() =>
                            edit((c) => {
                              c.projects[i].thumb = src;
                            })
                          }
                        >
                          設為封面
                        </button>
                        <button
                          style={{ ...ghost, padding: '4px 6px', fontSize: 12 }}
                          onClick={() =>
                            edit((c) => {
                              c.projects[i].media = (c.projects[i].media || []).filter((_, k) => k !== m);
                            })
                          }
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    upload(i, e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            ))}

            <button style={ghost} onClick={addProject}>
              新增系列
            </button>
          </>
        )}
      </div>

      {content && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            background: '#111',
            borderTop: '1px solid #242424',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <button style={button} onClick={save} disabled={busy || !dirty}>
            {busy ? '處理緊…' : '儲存到網站'}
          </button>
          <span style={{ color: message.includes('失敗') ? '#e08a8a' : '#999' }}>
            {message || (dirty ? '有未儲存嘅改動' : '冇未儲存嘅改動')}
          </span>
        </div>
      )}
    </div>
  );
}
