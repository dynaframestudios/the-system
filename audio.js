(()=>{
 const K='the-system-audio-v7';let cfg={enabled:true,volume:35,profile:'arcane'};
 try{cfg={...cfg,...JSON.parse(localStorage.getItem(K)||'{}')}}catch{}
 let ctx=null,last=0;
 function play(type='tap'){
  if(!cfg.enabled||cfg.volume<=0)return;
  const stamp=performance.now();if(type==='tap'&&stamp-last<70)return;last=stamp;
  try{
   ctx??=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume().catch(()=>{});
   const notes={tap:[[540,0,.045]],navigate:[[390,0,.045],[620,.045,.075]],quest:[[480,0,.10],[720,.11,.14],[960,.25,.22]],level:[[330,0,.18],[440,.14,.18],[660,.29,.23],[880,.47,.42]],warning:[[280,0,.18],[220,.18,.26]],achievement:[[500,0,.1],[740,.1,.18],[990,.25,.33]],test:[[580,0,.08],[900,.12,.28]]}[type]||[[460,0,.08]];
   if(cfg.profile==='minimal'&&type!=='tap')notes=notes.slice(0,2);
   const now=ctx.currentTime+.006;
   notes.forEach(([freq,offset,dur],i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=cfg.profile==='minimal'?'sine':type==='warning'?'triangle':'sine';o.frequency.setValueAtTime(freq,now+offset);if(type==='warning')o.frequency.exponentialRampToValueAtTime(freq*.76,now+offset+dur);
    const amp=Number(cfg.volume)/100*(type==='tap'?.055:.095);g.gain.setValueAtTime(.0001,now+offset);g.gain.exponentialRampToValueAtTime(Math.max(.001,amp),now+offset+.015);g.gain.exponentialRampToValueAtTime(.0001,now+offset+dur);o.connect(g).connect(ctx.destination);o.start(now+offset);o.stop(now+offset+dur+.02);
   });
  }catch(e){/* Audio may be blocked until first gesture, or unavailable */}
 }
 window.SystemAudio={play,get:()=>({...cfg}),set:next=>{cfg={...cfg,...next};localStorage.setItem(K,JSON.stringify(cfg));}};
 document.addEventListener('click',e=>{const control=e.target.closest('button');if(!control||control.disabled)return;const action=control.dataset.action;if(action==='quest')play('quest');else if(action==='penalty')play('achievement');else if(action==='excuse')play('warning');else if(control.dataset.tab)play('navigate');else if(action==='test-sound')return;else if(action==='test-alert')play('test');else play('tap')},true);
 document.addEventListener('change',e=>{if(e.target.id==='sfx-enabled'){window.SystemAudio.set({enabled:e.target.checked});play('tap')}else if(e.target.id==='sfx-volume'){window.SystemAudio.set({volume:Number(e.target.value)});play('tap')}else if(e.target.id==='sfx-profile'){window.SystemAudio.set({profile:e.target.value});play('navigate')}},true);
})();
