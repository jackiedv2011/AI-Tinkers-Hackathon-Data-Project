/* Headroom: protected work, reversible examples, and ambient file ecosystem. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const menu = $('.menu-btn'), nav = $('#main-nav');
  function closeMenu() { menu.setAttribute('aria-expanded','false'); nav.classList.remove('open'); }
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded',String(open)); nav.classList.toggle('open',open); });
  $$('#main-nav a').forEach(a => a.addEventListener('click',closeMenu));
  document.addEventListener('click',e => { if (!e.target.closest('.hdr-left')) closeMenu(); });
  document.addEventListener('keydown',e => { if(e.key==='Escape') closeMenu(); });
  const dialog=$('.info-dialog');
  function info(title,paragraphs) { $('#info-title').textContent=title; const body=$('[data-info-body]'); body.replaceChildren(); paragraphs.forEach(text=>{const p=document.createElement('p');p.textContent=text;body.append(p);});dialog.showModal(); }
  $$('.dialog-close,[data-info-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();});
  $$('[data-download]').forEach(b=>b.addEventListener('click',()=>info('A little more room, soon.', ['Windows is our working MVP. The public installer has not been linked yet.','macOS and the iPhone companion are planned. The iPhone companion is for status and control; it cannot manage other apps or their files.'])));
  $('[data-safety]').addEventListener('click',()=>info('Your work comes first.', ['Protected folders and the foreground app are excluded from resource actions. All actions are limited to approved scope.','Only exact duplicates are quarantined. The original remains in place, and the duplicate has a restore path. Quarantine is not permanent deletion and does not itself free physical disk space.','Only pre-approved idle background apps may be closed gracefully under pressure. Reopening does not restore their previous session.','Deterministic rules authorize actions. AI can explain, but cannot override these rules.']));
  let held=false;
  $('[data-reclaim]').addEventListener('click',()=>{held=!held; $('[data-reclaim-scene]').classList.toggle('held',held); $('[data-reclaim]').textContent=held?'Restore the example ↗':'Try the safe move ↗';$('[data-reclaim-status]').textContent=held?'Extra copy held in quarantine. Original untouched.':'The original stays right where it belongs.';});
  $('[data-receipt-restore]').addEventListener('click',()=>{const b=$('[data-receipt-restore]');b.disabled=true;b.textContent='Example file restored ✓';$('[data-receipt-status]').textContent='Returned to its original location. This demo changes no files.';});
  const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');observer.unobserve(e.target);}});},{threshold:.12});
  $$('[data-words]').forEach(el=>{if(!reduced.matches){const parts=[...el.childNodes].flatMap(n=>n.nodeName==='BR'?['\n']:n.textContent.trim().split(/\s+/));el.textContent='';let i=0;parts.forEach(word=>{if(word==='\n'){el.append(document.createElement('br'));return;}const outer=document.createElement('span'),inner=document.createElement('span');outer.className='w';inner.textContent=word+' ';inner.style.setProperty('--i',i++);outer.append(inner);el.append(outer);});}observer.observe(el);});
  $$('[data-rise]').forEach(el=>{el.classList.add('rise');observer.observe(el);});
  $('[data-hero-stack]').classList.add('on');
  const tiles=['a','b','c','d'].flatMap(prefix=>Array.from({length:16},(_,i)=>`assets/tiles/${prefix}-${String(i).padStart(2,'0')}.jpg`)).concat(['folder','code','notes','memory','project','archive'].map(n=>`assets/headroom/${n}.svg`));
  const sphere=window.HeadroomSphere;
  if(sphere){sphere.create($('#sphere-hero'),{tiles,onReady:()=>$('.hero-sphere-in').classList.add('on')});sphere.create($('#sphere-dream'),{tiles,seed:21,count:260,speed:.024,mouse:.08,scrollYaw:0,box:()=>Math.max(1200,innerWidth)});}
})();
