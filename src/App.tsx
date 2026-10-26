import React,{useState,useEffect,useRef} from 'react';
import {CATEGORIES,VIDEOS,DETAILS,THICKNESS,calculatePose,wrap,shortestDelta} from './carouselMath.mjs';

declare global {interface Window {openPortfolioCategory?:(key:string)=>void;works?:Array<{category:string}>;}}

function Icon({kind}:{kind:'prev'|'next'|'play'|'pause'}){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{kind==='prev'?<path d="m15 5-7 7 7 7"/>:kind==='next'?<path d="m9 5 7 7-7 7"/>:kind==='play'?<path d="m8 5 11 7-11 7Z" fill="currentColor"/>:<><path d="M8 5v14M16 5v14" strokeWidth="3"/></>}</svg>;}

export default function App(){
 const cardCount=CATEGORIES.length;
 const sceneRef=useRef<HTMLDivElement|null>(null),cardsRefs=useRef<Array<HTMLButtonElement|null>>([]);
 const videosRefs=useRef<Array<HTMLVideoElement|null>>([]),frameId=useRef(0),progress=useRef(0),seek=useRef<number|null>(null);
 const mouse=useRef({x:0,y:0,targetX:0,targetY:0});
 const drag=useRef<{id:number;x:number;progress:number;moved:boolean}|null>(null),suppressClick=useRef(false);
 const reduced=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [playing,setPlaying]=useState(!reduced.current),[active,setActive]=useState(0),[expanded,setExpanded]=useState(false);
 const playingRef=useRef(playing),expandedRef=useRef(expanded);
 const [metrics,setMetrics]=useState({cardW:336,cardH:211,height:760});
 playingRef.current=playing;expandedRef.current=expanded;
 const go=(direction:number)=>{seek.current=Math.round(progress.current)+direction;};
 const select=(i:number)=>{if(suppressClick.current)return;setExpanded(true);window.openPortfolioCategory?.(CATEGORIES[i].key);};

 useEffect(()=>{
  const scene=sceneRef.current;if(!scene)return;
  const resize=()=>{const w=scene.clientWidth,h=scene.clientHeight;let cardW=Math.round((w*.16+130)*Math.min(1,Math.max(.65,h/850)));cardW=Math.min(336,Math.max(150,cardW));setMetrics({cardW,cardH:Math.round(cardW/1.5925),height:h});};
  resize();const observer=new ResizeObserver(resize);observer.observe(scene);
  const close=()=>{setExpanded(false);cardsRefs.current[wrap(Math.round(progress.current))]?.focus({preventScroll:true});};
  const preference=(event:MediaQueryListEvent)=>{reduced.current=event.matches;if(event.matches)setPlaying(false);};
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',preference);
  window.addEventListener('portfolio:close-category',close);
  const wheel=(event:WheelEvent)=>{if(Math.abs(event.deltaX)>Math.abs(event.deltaY)||event.shiftKey){event.preventDefault();seek.current=null;progress.current+=(event.deltaX||event.deltaY)*.003;}};
  scene.addEventListener('wheel',wheel,{passive:false});
  return()=>{observer.disconnect();media.removeEventListener('change',preference);window.removeEventListener('portfolio:close-category',close);scene.removeEventListener('wheel',wheel);};
 },[]);

 useEffect(()=>{
  const scene=sceneRef.current;if(!scene)return;
  let visible=false,last=0,lastActive=-1;
  const stopVideos=()=>videosRefs.current.forEach(v=>v?.pause());
  const tick=(time:number)=>{
   if(!visible||document.hidden){frameId.current=0;stopVideos();return;}
   const dt=last?Math.min(time-last,48):16.667;last=time;
   if(seek.current!==null){if(reduced.current){progress.current=seek.current;seek.current=null;}else{progress.current+=(seek.current-progress.current)*(1-Math.pow(.86,dt/16.667));if(Math.abs(seek.current-progress.current)<.0003){progress.current=seek.current;seek.current=null;}}}
   else if(playingRef.current&&!expandedRef.current&&!drag.current&&!reduced.current)progress.current+=dt*.000096;
   const damping=1-Math.pow(.92,dt/16.667);mouse.current.x+=(mouse.current.targetX-mouse.current.x)*damping;mouse.current.y+=(mouse.current.targetY-mouse.current.y)*damping;
   scene.dataset.progress=progress.current.toFixed(4);
   const index=wrap(Math.round(progress.current));if(index!==lastActive){lastActive=index;setActive(index);}
   cardsRefs.current.forEach((card,i)=>{
    if(!card)return;
    const pose=calculatePose(i,progress.current,metrics.cardH,metrics.height,reduced.current?0:mouse.current.x,reduced.current?0:mouse.current.y);
    card.style.visibility=pose.visible?'visible':'hidden';card.style.transform=pose.transform;card.style.zIndex=String(Math.round(pose.z));
    for(let face=0;face<2;face++){
     const video=videosRefs.current[i*2+face];if(!video)continue;
     const shouldPlay=playingRef.current&&!expandedRef.current&&pose.absOffset<1.6&&(face===0?pose.front:!pose.front);
     if(shouldPlay){if(!video.getAttribute('src'))video.src=VIDEOS[i];if(video.paused&&!video.dataset.blocked){video.dataset.blocked='pending';video.play().then(()=>{delete video.dataset.blocked;}).catch(error=>{if(error.name==='AbortError')delete video.dataset.blocked;else video.dataset.blocked='true';});}}
     else if(!video.paused)video.pause();
    }
   });
   frameId.current=requestAnimationFrame(tick);
  };
  const start=()=>{last=0;if(!frameId.current&&visible&&!document.hidden)frameId.current=requestAnimationFrame(tick);};
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else{cancelAnimationFrame(frameId.current);frameId.current=0;stopVideos();}},{threshold:.02});observer.observe(scene);
  document.addEventListener('visibilitychange',start);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',start);cancelAnimationFrame(frameId.current);frameId.current=0;stopVideos();};
 },[metrics]);

 return <div ref={sceneRef} className="bank-scene relative overflow-hidden bg-transparent text-white select-none" role="region" aria-roledescription="轮播" aria-label={cardCount+' 个作品模块 3D 卡片轮播'} tabIndex={0}
  onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();mouse.current.targetX=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width/2)));mouse.current.targetY=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height/2)));}}
  onMouseLeave={()=>{mouse.current.targetX=0;mouse.current.targetY=0;}}
  onPointerDown={e=>{suppressClick.current=false;if((e.target as HTMLElement).closest('[data-control]'))return;drag.current={id:e.pointerId,x:e.clientX,progress:progress.current,moved:false};}}
  onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x;if(Math.abs(dx)>7){d.moved=true;suppressClick.current=true;seek.current=null;progress.current=d.progress-dx/(metrics.cardW*.8);if(!e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);}}}
  onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);const moved=drag.current?.moved;if(moved){drag.current=null;seek.current=Math.round(progress.current);setTimeout(()=>{suppressClick.current=false;},0);}else drag.current=null;}}
  onPointerCancel={()=>{drag.current=null;seek.current=Math.round(progress.current);}}
  onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home')seek.current=Math.round(progress.current)-wrap(Math.round(progress.current));else if(e.key==='End')seek.current=Math.round(progress.current)-wrap(Math.round(progress.current))+cardCount-1;else go(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);}}}>
  <div className="bank-camera absolute inset-0 flex items-center justify-center pointer-events-none" style={{perspective:'1350px'}}>
   <div className="bank-coordinate absolute" style={{width:metrics.cardW,height:metrics.cardH,transformStyle:'preserve-3d'}}>
    {CATEGORIES.map((category,i)=><button key={category.key} ref={el=>{cardsRefs.current[i]=el;}} className="bank-card absolute inset-0" style={{width:metrics.cardW,height:metrics.cardH,transformStyle:'preserve-3d'}} type="button" tabIndex={active===i?0:-1} aria-label={category.label+'，浏览作品'} aria-current={active===i?'true':undefined} data-category={category.key} onClick={()=>select(i)}>
     {THICKNESS.map((z,j)=>j>0&&j<THICKNESS.length-1?<div className="bank-slice absolute inset-0" key={j} style={{transform:`translateZ(${z}px)`}}/>:
      <div key={j} className={'bank-face absolute inset-0 '+(j===0?'bank-back':'bank-front')} style={{transform:`translateZ(${z}px)${j===0?' rotateX(180deg)':''}`,backgroundImage:`radial-gradient(ellipse at 80% 10%,${category.color}90,transparent 60%),linear-gradient(135deg,#111,${category.color}45 60%,#070707)`}}>
       <div className={'bank-video-wrap absolute inset-0 '+(j===0?'bank-video-blur':'')}><video ref={el=>{videosRefs.current[i*2+(j===0?1:0)]=el;}} autoPlay loop muted playsInline preload="none" aria-hidden="true" className="absolute inset-0 size-full object-cover"/></div>
       {j===0?<><div className="bank-stripe absolute"/><div className="bank-back-info absolute"><span className="bank-number">{DETAILS[i%DETAILS.length].number}</span><span className="bank-holder">{DETAILS[i%DETAILS.length].name} <span className="bank-divider">•</span> CVV: {DETAILS[i%DETAILS.length].cvv}</span><span className="bank-back-category">{category.label} / {category.english}</span></div></>:
        <div className="bank-front-overlay absolute inset-0"><span className="bank-category absolute">{category.label}</span><span className="bank-edition absolute">0{i+1} / {category.english}</span></div>}
      </div>)}
    </button>)}
   </div>
  </div>
  <div className="bank-controls absolute flex items-center justify-between" data-control="true">
   <button className="bank-control" type="button" onClick={()=>go(-1)} aria-label="上一个作品模块"><Icon kind="prev"/></button>
   <div className="bank-dots flex items-center">{CATEGORIES.map((c,i)=><button key={c.key} className={'bank-dot '+(active===i?'is-active':'')} type="button" aria-label={'切换到'+c.label} aria-current={active===i?'true':undefined} onClick={()=>{const delta=shortestDelta(wrap(Math.round(progress.current)),i);seek.current=Math.round(progress.current)+delta;}}/>)}</div>
   <button className="bank-control" type="button" onClick={()=>go(1)} aria-label="下一个作品模块"><Icon kind="next"/></button>
   <button className="bank-control bank-play-toggle" type="button" onClick={()=>{setPlaying(v=>!v);videosRefs.current.forEach(v=>{if(v)delete v.dataset.blocked;});}} aria-label={playing?'暂停卡片轮播':'播放卡片轮播'} aria-pressed={!playing}><Icon kind={playing?'pause':'play'}/></button>
  </div>
  <p className="sr-only" aria-live="polite" aria-atomic="true">{active+1} / {cardCount} · {CATEGORIES[active].label}</p>
 </div>;
}
