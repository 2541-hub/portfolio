import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import gsap from 'gsap';
import works from './works.json';

const FILM_GRAIN_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
)}`;

// 所有作品数据都在 src/works.json 里维护，这里只做读取和整理，不再写死内容
const ARCHIVE_FRAGMENTS = works.archive.map((frag, i) => ({ id: `f${i + 1}`, ...frag }));

const CATEGORIES = works.categories;

// 把平铺的作品列表按 category 分组，保持原来 PROJECTS[分类id] 的读取方式不变。
// 系列没写 layout 时沿用所属分类的模板，没写 id 时按位置自动生成
const PROJECTS = works.projects.reduce((groups, proj, i) => {
  const category = CATEGORIES.find((c) => c.id === proj.category);
  (groups[proj.category] ||= []).push({
    ...proj,
    id: proj.id || `series-${i}`,
    layout: proj.layout || category?.layout || 'horizontal',
  });
  return groups;
}, {});

// 按后缀判断 media 里的条目是视频还是图片
const isVideo = (src) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src);

const DraggableFragment = ({ data, highestZ, setHighestZ, parallaxRef }) => {
  const [pos, setPos] = useState({ x: data.initX || 0, y: data.initY || 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [zIndex, setZIndex] = useState(1);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const newZ = highestZ + 1;
    setZIndex(newZ);
    setHighestZ(newZ);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  // transition 只覆盖 filter/box-shadow：transform 每次 pointermove 都会更新，
  // 如果也被 CSS 过渡覆盖，拖拽时元素会一直滞后于指针、产生"橡皮筋"式卡顿感
  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`absolute select-none transition-[filter,box-shadow] duration-150 ${isDragging ? 'cursor-grabbing shadow-2xl brightness-110' : 'cursor-grab shadow-xl saturate-[.6] saturate-[.55] brightness-90 hover:saturate-100 hover:brightness-110 hover:brightness-100'}`}
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${isDragging ? 1.05 : 1})`, width: `${data.w}px`, zIndex: zIndex, touchAction: 'none' }}
    >
      {/* 视差深度层：与拖拽的 outer transform 相互独立，滚动时按 scrollSpeedFactor 单独位移 */}
      <div ref={parallaxRef} style={{ willChange: 'transform' }}>
        <img src={data.src} alt="fragment" className="w-full h-auto block ppointer-events-noneointer-events-none" />
      </div>
    </div>
  );
};

const ViewThreshold = ({ onEnter }) => (
  <div className="flex-1 flex flex-col items-center justify-center cursor-pointer group" onClick={onEnter}>
    <h1 className="text-[8vw] font-light tracking-[0.2em] text-[#333] group-hover:text-[#fff] transition-colors duration-1000 select-none">PRODUCER</h1>
    <div className="mt-8 font-mono text-[10px] text-[#555] tracking-widest uppercase animate-pulse">[ Click to initialize system ]</div>
  </div>
);

const LABEL_WIDE_GAP = 6; // 默认字间距（比原来的 tracking-widest 更宽），固定不变，不参与动画
const LABEL_TIGHT_GAP = 5.25; // 仅用来推导收紧幅度，本身不再被动画直接赋值
const LABEL_GAP_DELTA = LABEL_WIDE_GAP - LABEL_TIGHT_GAP; // 用 transform 叠加位移复现字间距收紧的视觉量，避免动画 marginRight 触发布局重排
const LABEL_FADE_FLOOR = 0.35; // 悬停时最右侧字符淡到的最低不透明度，最左侧字符始终保持 1
const LABEL_OVERSHOOT = 1.2; // 归位时冲过真正落点的量，随后再弹回 0，呼应向左移动的两段式力度感

const ViewIndex = ({ onSelectCategory }) => {
  const [hoveredImage, setHoveredImage] = useState(CATEGORIES[0].preview);
  const previewImgRef = useRef(null);
  const charRefs = useRef([]);

  // 单反变焦转场：预览图每次切换都从"脱焦+放大"平息为"清晰对焦+原始尺寸"
  useEffect(() => {
    if (!previewImgRef.current) return;
    gsap.fromTo(
      previewImgRef.current,
      { filter: 'blur(15px)', scale: 1.15 },
      { filter: 'blur(0px)', scale: 1, duration: 1.0, ease: 'power4.out', overwrite: true }
    );
  }, [hoveredImage]);

  // 从左到右的透明度渐变：最左侧字符保持 1，越往右越淡，淡化程度按字符串
  // 长度等比例分布，长短标题都能从"完全清晰"平滑过渡到 LABEL_FADE_FLOOR
  const fadeTo = (i, _target, targets) => 1 - (i / Math.max(1, targets.length - 1)) * (1 - LABEL_FADE_FLOOR);

  // 之前收紧/归位是绑在同一条 timeline 里、进入悬停后自动播完整个来回，跟鼠标
  // 是否真的离开毫无关系——这就是"归位提前触发、显得急促"的根源。现在拆成
  // 两个独立触发的动作：进入只做收紧+位移，并停在那个状态上不再自动归位；
  // 归位单独绑定到 onMouseLeave，只有鼠标真正离开悬停区域才会开始播放。
  const handleEnterCategory = (cat, idx) => {
    setHoveredImage(cat.preview);
    const chars = charRefs.current[idx];
    if (!chars || chars.length === 0) return;

    gsap.killTweensOf(chars);
    // 之前用 GSAP 动画 marginRight 来做"字间距收紧"——marginRight 是布局属性，
    // 每一帧都会触发整行重排，十几个字符同时做还叠加着图片的 blur 滤镜，
    // 主线程忙不过来就会掉帧，这正是"卡顿"的真实成因，不是曲线形状的问题。
    // 现在字间距永远保持静态（LABEL_WIDE_GAP），收紧效果改由每个字符按自身
    // 序号叠加一段 translateX 实现——纯 transform，只走合成器线程，不再触发重排。
    gsap.timeline({ delay: 0.05 })
      // 向左移动 + 字间距收紧压缩 + 从左到右的透明度渐变，逐字依次触发（stagger），三者同步发生
      .to(chars, { x: (i) => -3 - i * LABEL_GAP_DELTA, opacity: fadeTo, duration: 0.4, ease: 'sine.inOut', stagger: 0.012 }, 'collapse')
      // 左到右：快速跨过大部分距离，字间距收紧量和透明度渐变都保持不变，提前 0.2s 与上一段尾声重叠
      .to(chars, { x: (i) => -0.6 - i * LABEL_GAP_DELTA, duration: 0.25, ease: 'sine.inOut', stagger: 0.012 }, '-=0.2');
    // 停在收紧+位移的状态上，不在这里自动归位
  };

  const handleLeaveCategory = (idx) => {
    const chars = charRefs.current[idx];
    if (!chars || chars.length === 0) return;

    gsap.killTweensOf(chars);
    gsap.timeline()
      // 归位第一段——冲过去：快速越过真正的归位点一点点，字间距也在这里松开，
      // 呼应"向左移动"那两段式的力度感，让归位不再是单一动作
      .to(chars, { x: LABEL_OVERSHOOT, duration: 0.18, ease: 'sine.out', stagger: 0.012 })
      // 归位第二段——弹回来：从超出点缓缓弹回真正的 0 位，透明度也在这里一起恢复满，
      // 和向左段的"加速再减速"对称、呼应
      .to(chars, { x: 0, opacity: 1, duration: 0.35, ease: 'sine.inOut', stagger: 0.012 }, '-=0.03');
  };

  return (
    <div className="flex-1 flex h-full">
      <div className="w-full md:w-1/2 flex flex-col justify-center pl-8 md:pl-32 pr-12 z-10">
        <div className="space-y-12">
          {CATEGORIES.map((cat, idx) => {
            const chars = Array.from(cat.name);
            return (
              <div key={cat.id} className="group cursor-pointer flex items-baseline space-x-6 w-max" onMouseEnter={() => handleEnterCategory(cat, idx)} onMouseLeave={() => handleLeaveCategory(idx)} onClick={() => onSelectCategory(cat.id)}>
                <span className="font-mono text-xs text-[#444] group-hover:text-[#888] transition-colors">0{idx + 1}</span>
                <h2 className="text-xl md:text-3xl font-light text-[#555] group-hover:text-[#fff] transition-colors duration-500">
                  {chars.map((char, charIdx) => (
                    <span
                      key={charIdx}
                      ref={(el) => {
                        if (!charRefs.current[idx]) charRefs.current[idx] = [];
                        charRefs.current[idx][charIdx] = el;
                      }}
                      className="inline-block"
                      style={{ marginRight: charIdx === chars.length - 1 ? 0 : `${LABEL_WIDE_GAP}px` }}
                    >
                      {char === ' ' ? ' ' : char}
                    </span>
                  ))}
                </h2>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hidden md:block w-1/2 h-full relative p-12">
        <div className="w-full h-full relative overflow-hidden bg-[#0d0d0d]">
          <img ref={previewImgRef} src={hoveredImage} alt="Preview" className="w-full h-full object-cover opacity-50 grayscale transition-opacity duration-700" style={{ willChange: 'transform, filter' }} />
        </div>
      </div>
    </div>
  );
};

const ViewProjectList = ({ categoryId, onSelectProject, onBack }) => {
  const projects = PROJECTS[categoryId] || [];
  const isWidescreen = !!CATEGORIES.find((c) => c.id === categoryId)?.wide;
  const gridContainerClass = isWidescreen ? "grid grid-cols-1 gap-y-16 max-w-7xl mx-auto" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 md:gap-4 max-w-7xl mx-auto";
  const imageAspectClass = isWidescreen ? "aspect-video" : "aspect-square";
  return (
    <div className="flex-1 flex flex-col px-8 md:px-24 py-24 relative overflow-y-auto scrollbar-hide">
      <div className="mb-12 flex items-center justify-between z-10 relative">
        <button onClick={onBack} className="font-mono text-[10px] text-[#555] hover:text-[#fff] tracking-widest transition-colors">{'< RETURN'}</button>
        <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase">INDEX // {categoryId}</div>
      </div>
      <div className="w-full">
        <div className={gridContainerClass}>
          {projects.map((proj) => (
            <div key={proj.id} className="group cursor-pointer relative overflow-hidden bg-[#0a0a0a]" onClick={() => onSelectProject(proj)}>
              <div className={`w-full ${imageAspectClass} relative`}>
                <img src={proj.thumb} alt={proj.title} className="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
                   <h3 className="text-xl font-light tracking-widest text-white">{proj.title}</h3>
                   <span className="font-mono text-[10px] tracking-widest text-[#aaa] mt-2">{proj.type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ViewProjectDetail = ({ project, onBack }) => {
  const scrollContainerRef = useRef(null);

  const handleWheel = (e) => {
    if (scrollContainerRef.current) {
      e.preventDefault();
      scrollContainerRef.current.scrollBy({
        left: e.deltaY * 0.8,
        behavior: 'smooth'
      });
    }
  };

  // media 为空时沿用原来的占位块，作品素材还没整理好也不会变成空白页
  const media = project.media || [];
  const naturalFit = project.fit === 'natural';
  const description = project.description ? (
    <p className="mt-4 max-w-sm font-mono text-[10px] text-[#555] tracking-widest leading-loose whitespace-pre-line">{project.description}</p>
  ) : null;

  if (project.layout === 'horizontal') {
    return (
      <div className="w-full h-full relative bg-[#0a0a0a] overflow-hidden">
        {/* 绝对定位的导航，定死在左上角，绝对不占用中间布局高度 */}
        <div className="absolute top-12 left-[12vw] z-50">
            <button onClick={onBack} className="font-mono text-[8px] tracking-[0.2em] text-[#555] hover:text-[#fff] transition-colors uppercase">{'< BACK'}</button>
            {description}
        </div>
        
        {/* 将 gap-12 缩小为 gap-4，缩小模块间隙贴近参考图 */}
        <div 
          ref={scrollContainerRef}
          onWheel={handleWheel}
          className="w-full h-full flex flex-nowrap items-center gap-4 overflow-x-auto overflow-y-hidden scrollbar-hide cursor-grab active:cursor-grabbing" 
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {media.length > 0
            ? media.map((src, i) => (
              // fit: "natural" 的系列保持 70vh 高度，宽度跟随每张图自身比例，完整显示不裁切
              <div key={i} className={`h-[70vh] ${naturalFit ? '' : 'aspect-[9/16] '}bg-[#111] flex-shrink-0 flex items-center justify-center border border-[#1a1a1a] shadow-2xl overflow-hidden`}>
                {isVideo(src)
                  ? <video src={src} className={naturalFit ? 'h-full w-auto block' : 'w-full h-full object-cover'} autoPlay muted loop playsInline />
                  : <img src={src} alt={`${project.title} ${i + 1}`} draggable={false} className={naturalFit ? 'h-full w-auto block' : 'w-full h-full object-cover'} />}
              </div>
            ))
            : [1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[70vh] aspect-[9/16] bg-[#111] flex-shrink-0 flex items-center justify-center border border-[#1a1a1a] shadow-2xl">
                <span className="text-[#333] font-mono text-[10px] uppercase">SEQUENCE {i}</span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // 宽屏主区域放 media 里的第一个视频（没有视频就放第一项），其余放进下方网格
  const heroIndex = Math.max(0, media.findIndex(isVideo));
  const hero = media[heroIndex];
  const details = media.filter((_, i) => i !== heroIndex);

  return (
    <div className="w-full h-full overflow-y-auto px-8 md:px-32 py-24 bg-[#0a0a0a]">
      <div className="mb-16">
        <button onClick={onBack} className="font-mono text-[10px] text-[#555] hover:text-[#fff] transition-colors">{'< BACK'}</button>
        {description}
      </div>
      {/* 将 mb-12 改为 mb-6，与下方 grid 的 gap-6 保持一致的间距 */}
      <div className="w-full aspect-video bg-[#111] border border-[#1a1a1a] flex items-center justify-center mb-6 overflow-hidden">
        {!hero
          ? <span className="text-[#333] font-mono text-sm">VIDEO_AREA</span>
          : isVideo(hero)
            ? <video src={hero} poster={project.poster} className="w-full h-full object-cover" controls playsInline />
            : <img src={hero} alt={project.title} className="w-full h-full object-cover" />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {media.length > 0
          ? details.map((src, i) => (
            <div key={i} className="aspect-[3/4] bg-[#111] border border-[#1a1a1a] flex items-center justify-center overflow-hidden">
              {isVideo(src)
                ? <video src={src} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                : <img src={src} alt={`${project.title} ${i + 1}`} className="w-full h-full object-cover" />}
            </div>
          ))
          : [1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] bg-[#111] border border-[#1a1a1a] flex items-center justify-center">
                <span className="text-[#333] font-mono text-xs">DETAIL_{i}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const ViewIdentityArchive = () => {
  const [highestZ, setHighestZ] = useState(10);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [scatteredFragments, setScatteredFragments] = useState([]);
  const scrollContainerRef = useRef(null);
  const parallaxNodes = useRef(new Map());

  useEffect(() => {
    const containerW = window.innerWidth;
    const containerH = window.innerHeight * 2.5;

    const scattered = ARCHIVE_FRAGMENTS.map(frag => {
      const minX = 40;
      const maxX = Math.max(minX, containerW - frag.w - 40);
      const minY = 60;
      const maxY = Math.max(minY, containerH - (frag.w * 1.5) - 100);

      return {
        ...frag,
        initX: Math.random() * (maxX - minX) + minX,
        initY: Math.random() * (maxY - minY) + minY,
        // 每个碎片各自的视差深度系数，制造不依赖 3D 模型的纵深错位感
        scrollSpeedFactor: 0.1 + Math.random() * 0.25
      };
    });
    setScatteredFragments(scattered);
  }, []);

  // 监听 Lenis 驱动这个容器产生的滚动事件，按各碎片的 scrollSpeedFactor
  // 施加不同步的纵向位移，制造多层空间视差深度
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const applyParallax = () => {
      const scrollTop = el.scrollTop;
      parallaxNodes.current.forEach((factor, node) => {
        node.style.transform = `translate3d(0, ${(-scrollTop * factor).toFixed(2)}px, 0)`;
      });
    };

    el.addEventListener('scroll', applyParallax, { passive: true });
    applyParallax();

    return () => el.removeEventListener('scroll', applyParallax);
  }, [scatteredFragments]);

  return (
    <div ref={scrollContainerRef} className="w-full h-full overflow-y-auto scrollbar-hide bg-[#0a0a0a]">
      <div className="w-full h-[50vh] relative overflow-hidden flex items-center justify-center cursor-crosshair group border-b border-[#1a1a1a]" 
           onMouseMove={(e) => { 
             const r = e.currentTarget.getBoundingClientRect(); 
             setMousePos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); 
           }}>
        <div className="absolute inset-0 opacity-20 transition-[background] duration-300 ease-out" style={{ background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.1) 0%, transparent 50%)` }} />
        <div className="font-mono text-[10px] text-[#333] tracking-[0.5em] group-hover:text-[#666] transition-colors duration-1000 z-10 relative">[ INTERACTIVE_TOPOLOGY_PLACEHOLDER ]</div>
      </div>
      
      <div className="w-full h-[50vh] px-8 md:px-24 py-16 border-b border-[#1a1a1a] bg-[#0d0d0d] flex flex-col justify-center">
        <div className="max-w-4xl">
          <h1 className="text-3xl md:text-5xl font-light tracking-[0.2em] text-[#eee] mb-8">DIGITAL PRODUCER</h1>
          <div className="font-mono text-xs md:text-sm text-[#888] leading-loose tracking-widest space-y-4">
            <p>SYSTEM ARCHITECT / VISUAL DIRECTOR / INTERACTION DESIGNER</p>
            <p className="text-[#555]">BASED IN STRUCTURAL LOGIC. OPERATING ACROSS MEDIUMS. REDEFINING BOUNDARIES THROUGH CONTROLLED CHAOS.</p>
          </div>
        </div>
      </div>

      <div className="w-full h-[250vh] relative bg-[#0a0a0a] overflow-hidden">
        <div className="absolute top-8 left-8 font-mono text-[10px] text-[#444] tracking-widest select-none pointer-events-none z-0 uppercase">[ Deconstructed Memory Bank ]</div>
        {scatteredFragments.map((frag) => (
          <DraggableFragment
            key={frag.id}
            data={frag}
            highestZ={highestZ}
            setHighestZ={setHighestZ}
            parallaxRef={(node) => {
              if (node) parallaxNodes.current.set(node, frag.scrollSpeedFactor);
              else parallaxNodes.current.forEach((_, n) => { if (!n.isConnected) parallaxNodes.current.delete(n); });
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default function PortfolioApp() {
  const [view, setView] = useState('P1');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [renderState, setRenderState] = useState(view);
  const stageRef = useRef(null);

  const navigateTo = (targetView) => {
    if (targetView === view) return;
    setIsTransitioning(true);
    setTimeout(() => { setView(targetView); setRenderState(targetView); setIsTransitioning(false); }, 500);
  };

  // 每次视图切换后，把丝滑滚动物理绑定到当前视图实际的滚动容器上，
  // 并重置其滚动位置——避免上一视图的滚动惯性/位置残留到新视图。
  useLayoutEffect(() => {
    const scrollEl = stageRef.current?.querySelector('.overflow-y-auto');
    if (!scrollEl) return;

    scrollEl.scrollTop = 0;

    const lenis = new Lenis({
      wrapper: scrollEl,
      content: scrollEl,
      lerp: 0.09,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [renderState]);

  const renderView = () => {
    switch(renderState) {
      case 'P1': return <ViewThreshold onEnter={() => navigateTo('P2')} />;
      case 'P2': return <ViewIndex onSelectCategory={(id) => { setSelectedCategory(id); navigateTo('P3'); }} />;
      case 'P3': return <ViewProjectList categoryId={selectedCategory} onSelectProject={(p) => { setSelectedProject(p); navigateTo('P4'); }} onBack={() => navigateTo('P2')} />;
      case 'P4': return <ViewProjectDetail project={selectedProject} onBack={() => navigateTo('P3')} />;
      case 'P5': return <ViewIdentityArchive />;
      default: return <ViewThreshold onEnter={() => navigateTo('P2')} />;
    }
  };

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] text-[#e5e5e5] font-sans flex flex-col overflow-hidden relative selection:bg-[#333] selection:text-white">
      <div className={`absolute top-8 right-8 md:right-12 z-50 flex space-x-6 md:space-x-8 font-mono text-[10px] transition-opacity duration-700 ${view === 'P1' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button onClick={() => navigateTo('P2')} className={`tracking-widest transition-colors ${(view === 'P2' || view === 'P3' || view === 'P4') ? 'text-white' : 'text-[#555] hover:text-[#999]'}`}>INDEX</button>
        <button onClick={() => navigateTo('P5')} className={`tracking-widest transition-colors ${view === 'P5' ? 'text-white' : 'text-[#555] hover:text-[#999]'}`}>ARCHIVE</button>
      </div>
      <div ref={stageRef} className={`flex-1 flex flex-col w-full h-full relative z-10 transition-opacity duration-500 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {renderView()}
      </div>
      <div className="fixed bottom-8 left-8 z-50 pointer-events-none mix-blend-difference">
        <div className="font-mono text-[8px] md:text-[10px] text-[#666] tracking-[0.2em] leading-relaxed">
          DIGITAL PRODUCER PORTFOLIO <br/>
          ITERATION_01 ©2026 <br/>
          SYS.CONTAINER_ACTIVE
        </div>
      </div>
      {/* 胶片噪点暗流：不可交互的全局叠加层，抹去纯数字网页的塑料冰冷感 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[999] opacity-[0.015]"
        style={{ backgroundImage: `url("${FILM_GRAIN_URL}")`, backgroundRepeat: 'repeat', backgroundSize: '160px 160px' }}
      />
    </div>
  );
}