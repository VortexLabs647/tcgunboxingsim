(() => {
 'use strict';

 const TAU=2*Math.PI;
 const clamp=value=>Math.max(0,Math.min(1,value));
 const ease=value=>1-(1-clamp(value))**3;
 const palettes={
  fire:['#ab2440','#ff591f','#fff2a5'], ice:['#2665e6','#64dfff','#ecfdff'],
  lightning:['#4b32d8','#b29cff','#fbfaff'], mist:['#18745a','#8beb57','#eeffb6'],
  earth:['#794331','#ec9850','#ffe8ac'], void:['#341074','#9d58ff','#ffd5ff'],
  light:['#b95a23','#ffd664','#fff9d1'], water:['#1653a9','#3ccfff','#e6ffff'],
  wind:['#4566a2','#a8d6ff','#effbff'], arcane:['#7626bd','#ed7afe','#fff0ff'],
  shard:['#3762a3','#80deff','#e7feff'], comet:['#a53143','#ff8b5a','#fff2c3'],
  ring:['#8443ad','#e896ff','#fff0ff'], boulder:['#67434a','#de9264','#fff0c8'],
  ribbon:['#a62d82','#ff8aca','#ffebf5'], volley:['#29697b','#74f5d4','#e7fff4'],
  fracture:['#3167a7','#7edcff','#e9fdff'], meteor:['#ab2440','#ff6940','#fff0b2'],
  prism:['#6d43b9','#ff9dea','#edfffa'], renew:['#267b59','#94f481','#f3ffbf'],
  bulwark:['#30618b','#74dffa','#e6fbff']
 };

 function line(ctx,path,color,width){
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.stroke(path);
 }
 function polygon(points){
  const path=new Path2D();
  points.forEach(([x,y],index)=>index?path.lineTo(x,y):path.moveTo(x,y));
  path.closePath();
  return path;
 }
 function fill(ctx,path,color){
  ctx.fillStyle=color;
  ctx.fill(path);
 }
 function streak(ctx,path,[dark,color,shine],width){
  line(ctx,path,dark,width+5);
  line(ctx,path,color,width);
  line(ctx,path,shine,Math.max(1.5,width*.31));
 }
 function arc(radius,start,end,vertical=1,x=0,y=0){
  const path=new Path2D();
  path.ellipse(x,y,radius,radius*vertical,0,start,end);
  return path;
 }
 function stone(ctx,x,y,size,angle,[dark,color,shine],kind='crystal'){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.scale(size,size);
  const facets=kind==='rock'?[[-.9,-.44],[.2,-.85],[.83,-.49],[.97,.43],[.28,.91],[-.57,.7]]:
   kind==='square'?[[-.65,-.7],[.65,-.7],[.65,.7],[-.65,.7]]:[[0,-1], [.66,-.23],[.53,.55],[0,.96],[-.52,.55],[-.66,-.23]];
  const shape=polygon(facets);
  fill(ctx,shape,color);
  line(ctx,shape,dark,.18);
  fill(ctx,polygon([facets[0],facets[1],[.14,.13],facets.at(-1)]),shine);
  fill(ctx,polygon([[.14,.13],facets[1],...facets.slice(2,-1)]),dark);
  ctx.restore();
 }
 function star(ctx,x,y,size,angle,color,points=4){
  const position=Array.from({length:points*2},(_,index)=>{
   const phase=angle+index*Math.PI/points,radius=size*(index%2 ? .26 : 1);
   return [x+Math.cos(phase)*radius,y+Math.sin(phase)*radius];
  });
  fill(ctx,polygon(position),color);
 }
 function fragments(ctx,t,palette,count,kind,phase=0){
  const travel=ease(t);
  for(let i=0;i<count;i++){
   const angle=phase+TAU*i/count,range=42+i%3*10;
   const x=Math.cos(angle)*(13+range*travel);
   const y=Math.sin(angle)*(13+range*travel)+(kind==='rock'?13:4)*travel*travel;
   const size=(4+i%3*3)*(1-.48*travel);
   if(kind==='spark')star(ctx,x,y,size,angle,palette[2]);
   else stone(ctx,x,y,size,angle+t*2,palette,kind);
  }
 }
 function flame(ctx,t,palette){
  const lift=ease(t);
  for(let i=0;i<3;i++){
   ctx.save();
   ctx.rotate((i-1)*.72+lift*.48);
   ctx.translate(0,22-lift*19);
   ctx.scale(.57+lift*.43,.52+lift*.48);
   const plume=new Path2D('M-39 12 C-29 -14 -5 -10 -8 -43 Q5 -39 12 -20 Q28 -30 23 -62 C48 -39 43 -13 19 8 Q-6 30 -39 12Z');
   fill(ctx,plume,palette[0]);
   fill(ctx,new Path2D('M-35 11 Q-15 2 -5 -22 Q2 -14 3 -8 Q23 -16 27 -45 C39 -21 25 -2 8 9 Q-13 20 -35 11Z'),palette[1]);
   streak(ctx,new Path2D('M-28 11 Q-6 11 8 -6 Q17 -15 21 -17'),palette,5);
   ctx.restore();
  }
  fragments(ctx,t,palette,7,'spark',Math.PI/7);
 }
 function freeze(ctx,t,palette){
  const growth=ease(t*1.5);
  for(let i=0;i<7;i++){
   const angle=i*TAU/7;
   const reach=growth*(25+i%3*7);
   stone(ctx,Math.sin(angle)*reach,Math.cos(angle)*reach,Math.max(.1,(17+i%3*5)*growth),-angle+Math.PI,palette);
  }
  fragments(ctx,t,palette,8,'crystal',.3);
 }
 function strike(ctx,t,palette){
  const point=ease(t*3);
  ctx.save();
  ctx.rotate(-.25);
  const bolt=new Path2D('M-27 -75 L-2 -51 L-14 -42 L10 -21 L-2 -14 L13 1 L4 8 L23 28');
  ctx.setLineDash([160*point,170]);
  streak(ctx,bolt,palette,10*(1-.55*t));
  ctx.setLineDash([]);
  const branches=new Path2D('M-14 -42 L-41 -33 L-48 -10 M10 -21 L38 -27 L51 -15 M4 8 L-19 17 L-29 37');
  streak(ctx,branches,palette,3.4*(1-.55*t));
  ctx.restore();
  fragments(ctx,t,palette,7,'spark');
 }
 function vapor(ctx,t,palette){
  const drift=ease(t);
  for(let i=0;i<7;i++){
   const x=Math.sin(i*2.1+t*3)* (15+i%3*8+15*drift),y=29-i*8-26*drift;
   const radius=10+i%3*4+9*drift;
   const cloud=ctx.createRadialGradient(x-3,y-4,2,x,y,radius*1.4);
   cloud.addColorStop(0,palette[2]);
   cloud.addColorStop(.38,palette[1]);
   cloud.addColorStop(.75,palette[0]+'bb');
   cloud.addColorStop(1,palette[0]+'00');
   fill(ctx,arc(radius*1.4,0,TAU,.81,x,y),cloud);
   if(i%2===0)streak(ctx,arc(4+i%3,3.6,5.5,1,x*.84,y-12),palette,1.8);
  }
 }
 function fault(ctx,t,palette){
  const spread=ease(t*1.4);
  ctx.save();
  ctx.translate(0,23);
  ctx.scale(Math.max(.01,spread),Math.max(.01,spread));
  const cracks=new Path2D('M-69 13 L-36 5 L-22 13 L0 0 L26 4 L35 -3 L66 -5 M0 0 L-9 -14 L-29 -18 M26 4 L41 18 L61 22 M-22 13 L-32 25');
  streak(ctx,cracks,palette,5*(1-.5*t));
  ctx.restore();
  for(let i=0;i<6;i++){
   const x=(i-2.5)*(9+12*spread),y=28-(39+i%3*14)*Math.sin(Math.PI*t*.92);
   stone(ctx,x,y,9+i%3*4,.24+i+t*2,palette,'rock');
  }
 }
 function vortex(ctx,t,palette){
  const radius=49*(.45+ease(t*2)*.55)*(1-.52*t**3);
  const core=arc(radius*.66,0,TAU,.89);
  const shade=ctx.createRadialGradient(0,0,0,0,0,radius);
  shade.addColorStop(0,'#160b34');
  shade.addColorStop(.64,palette[0]);
  shade.addColorStop(1,palette[1]+'00');
  fill(ctx,core,shade);
  for(let i=0;i<3;i++){
   const trail=new Path2D();
   for(let j=0;j<=26;j++){
    const step=j/26,angle=i*TAU/3+t*4+step*2.5;
    const r=radius*(1.2-.9*step);
    if(j===0)trail.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);
    else trail.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);
   }
   streak(ctx,trail,palette,8-4*t);
  }
  fragments(ctx,1-t,palette,6,'crystal');
 }
 function sunburst(ctx,t,palette){
  const spread=ease(t);
  for(let i=0;i<5;i++){
   const x=(i-2)*17*(.38+spread*.62),start=-61+(i%2)*13+(1-spread)*19;
   const ray=new Path2D();
   ray.moveTo(x,start);
   ray.lineTo(x*.36,27);
   streak(ctx,ray,palette,3.5+(i===2?5:0));
   star(ctx,x,start+12,7,i*.34,palette[2]);
  }
  streak(ctx,arc(18+44*spread,0,TAU,.26,0,28),palette,4*(1-t)+1);
  star(ctx,0,6,18+11*Math.sin(t*Math.PI),0,palette[2]);
 }
 function wave(ctx,t,palette){
  const motion=ease(t);
  ctx.save();
  ctx.translate(-30+61*motion,7);
  ctx.rotate(-.27+motion*.45);
  ctx.scale(.61+.39*motion,.63+.37*motion);
  fill(ctx,new Path2D('M-55 34 Q-11 38 7 8 Q16 -7 3 -17 Q-11 -25 -20 -10 Q-23 -33 0 -42 Q25 -53 40 -33 Q55 -8 27 16 Q12 30 46 27 Q16 48 -55 34Z'),palette[0]);
  fill(ctx,new Path2D('M-49 33 Q1 42 23 11 Q38 -11 18 -25 Q2 -38 -19 -18 Q-7 -47 21 -43 Q53 -36 40 -6 Q26 16 19 21 Q7 43 -49 33Z'),palette[1]);
  streak(ctx,new Path2D('M-18 -21 Q-5 -45 20 -41 Q39 -36 40 -19 M-42 33 Q-10 40 9 28'),palette,4);
  ctx.restore();
  fragments(ctx,t,palette,7,'crystal',.5);
 }
 function cyclone(ctx,t,palette){
  const spread=ease(t);
  for(let i=0;i<4;i++){
   const sweep=.65+i*.5+t*6;
   streak(ctx,arc((28+i*6)*(.57+spread*.43),sweep,sweep+4.2,.25,Math.sin(sweep)*10,24-i*15),palette,4+i);
  }
  fragments(ctx,t,palette,5,'spark',2*t);
 }
 function sigil(ctx,t,palette){
  const radius=21+46*ease(t);
  streak(ctx,arc(radius,0,TAU),palette,3.4);
  ctx.save();
  ctx.rotate(t*1.7);
  line(ctx,polygon([[0,-radius],[radius,0],[0,radius],[-radius,0]]),palette[1],2.3);
  for(let i=0;i<6;i++){
   const a=i*TAU/6;
   star(ctx,Math.cos(a)*radius,Math.sin(a)*radius,9,a,palette[2]);
  }
  ctx.restore();
  star(ctx,0,0,33*(1-t*.6),t*.6,palette[2],6);
 }
 function slash(ctx,t,palette,count=1){
  const growth=ease(t*1.6);
  for(let i=0;i<count;i++){
   ctx.save();
   ctx.rotate((i-(count-1)/2)*.77);
   ctx.translate((growth-.5)*43,0);
   const cut=new Path2D('M-50 26 Q-12 -11 52 -30 Q18 -5 -50 26Z');
   fill(ctx,cut,palette[1]);
   streak(ctx,new Path2D('M-49 25 Q-11 -10 52 -30'),palette,5);
   ctx.restore();
  }
  fragments(ctx,t,palette,6,'crystal',1);
 }
 function shatter(ctx,t,palette){
  const radius=(22+40*ease(t));
  for(let i=0;i<3;i++){
   const angle=i*TAU/3+t, x=Math.cos(angle)*radius*.61,y=Math.sin(angle)*radius*.61;
   stone(ctx,x,y,17*(1-.43*t),angle,palette,'square');
  }
  fragments(ctx,t,palette,8,'square',.4);
 }
 function orbit(ctx,t,palette){
  const radius=16+48*ease(t);
  for(let i=0;i<2;i++)streak(ctx,arc(radius*(1-i*.3),t*2+i*2,t*2+i*2+4.9,.72),palette,5-i*2);
  fragments(ctx,t,palette,6,'spark',t);
 }
 function rubble(ctx,t,palette){
  const push=ease(t*1.7);
  for(let i=0;i<4;i++){
   const x=(i-1.5)*(17+24*push),y=13-(i%3+1)*14*Math.sin(Math.PI*t);
   stone(ctx,x,y,17-i%3*3,i*.78+t*3,palette,'rock');
  }
  streak(ctx,new Path2D('M-62 25 Q-31 15 -10 29 T44 28 M-42 36 Q-24 36 -10 40'),palette,3.6);
 }
 function comet(ctx,t,palette){
  const travel=ease(t*1.3);
  ctx.save();
  ctx.translate(-20+53*travel,-11+20*travel);
  ctx.rotate(.45);
  const tail=new Path2D('M-64 -4 Q-31 -12 3 -11 Q36 -9 22 8 Q-9 14 -64 -4Z');
  fill(ctx,tail,palette[1]);
  streak(ctx,new Path2D('M-61 -4 Q-28 -6 16 1 M-40 -15 Q-10 -15 3 -12'),palette,3.5);
  star(ctx,19,1,22*(1-t*.48),t*2,palette[2]);
  ctx.restore();
  fragments(ctx,t,palette,5,'spark',.8);
 }
 function meteor(ctx,t,palette){
  const drop=ease(t*2.8);
  const x=-36*(1-drop)+13*t,y=-59*(1-drop)+24*t;
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(-.65);
  const tail=new Path2D('M-16 4 Q-15 -12 -1 -55 Q15 -16 19 4 Q10 13 -16 4Z');
  fill(ctx,tail,palette[1]);
  streak(ctx,new Path2D('M-8 7 Q-2 -21 -1 -44 M8 4 Q9 -13 4 -21'),palette,3);
  stone(ctx,0,10,21-7*t,t*1.3,palette,'rock');
  ctx.restore();
  fragments(ctx,t,palette,8,'rock',.4);
 }
 function ribbon(ctx,t,palette){
  const travel=ease(t);
  ctx.save();
  ctx.rotate(-.42+travel*.81);
  ctx.scale(.56+.44*travel,.59+.41*travel);
  streak(ctx,new Path2D('M-72 9 C-45 39 -19 -22 9 -8 S48 19 70 -18 M-54 24 C-30 22 -22 -5 -3 -9'),palette,7-4*t);
  ctx.restore();
  fragments(ctx,t,palette,7,'spark',.42);
 }
 function spectrum(ctx,t,palette){
  const growth=ease(t);
  const colors=[palette[1],'#a4e7ff','#f9e79d'];
  for(let i=0;i<3;i++){
   ctx.save();
   ctx.rotate(-.73+i*.7+growth*.62);
   const arcPath=arc(21+growth*34,1.06,4.7,.45);
   streak(ctx,arcPath,[palette[0],colors[i],palette[2]],7-i);
   ctx.restore();
  }
  fragments(ctx,t,palette,6,'spark',t*2);
 }
 function mend(ctx,t,palette){
  for(let i=0;i<6;i++){
   const a=i*TAU/6+t*1.8,x=Math.cos(a)*(33+24*t),y=Math.sin(a)*24-18*t;
   star(ctx,x,y,6+i%3*3,0,palette[2]);
  }
  streak(ctx,arc(28+29*ease(t),0,TAU,.35,0,19-20*t),palette,5-2*t);
 }
 function ward(ctx,t,palette){
  const size=.55+ease(t)*.45;
  ctx.scale(size,size);
  const shield=new Path2D('M-42 -25 L0 -43 L42 -25 L37 12 Q28 39 0 52 Q-28 39 -37 12 Z');
  fill(ctx,shield,palette[1]+'58');
  streak(ctx,shield,palette,5);
  star(ctx,0,2,23,0,palette[2]);
 }
 const shapes={
  fire:flame,ice:freeze,lightning:strike,mist:vapor,earth:fault,void:vortex,light:sunburst,water:wave,wind:cyclone,arcane:sigil,
  shard:slash,comet,ring:orbit,boulder:rubble,ribbon,volley:shatter,
  fracture:(ctx,t,palette)=>slash(ctx,t,palette,3),meteor,prism:spectrum,renew:mend,bulwark:ward
 };

 async function play(layer,{x,y,cardWidth,element,motif,special,guarded,reduced,direction}){
  const type=element||motif;
  const palette=palettes[type]??palettes.shard;
  const width=layer.clientWidth,height=layer.clientHeight;
  const desired=Math.min(112,cardWidth*1.22,width*.35);
  const radius=Math.min(desired,Math.min(y,height-y)+17,Math.min(x,width-x)+17);
  if(radius<12)return;
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const pixelRatio=Math.min(2,window.devicePixelRatio||1);
  canvas.className='arena-impact';
  canvas.dataset.impact=type;
  canvas.dataset.motif=motif;
  canvas.width=canvas.height=Math.ceil(radius*2*pixelRatio);
  const centerX=Math.max(radius,Math.min(width-radius,x));
  const centerY=Math.max(radius,Math.min(height-radius,y));
  Object.assign(canvas.style,{
   width:radius*2+'px',height:radius*2+'px',left:centerX-radius+'px',top:centerY-radius+'px'
  });
  const duration=reduced?200:element==='lightning'?365:special?500:445;
  layer.append(canvas);
  try{
   await new Promise(resolve=>{
    const start=performance.now(),scale=canvas.width/200;
    function frame(now){
     const t=clamp((now-start)/duration);
     if(t===1||!layer.isConnected||document.hidden){resolve();return;}
     ctx.resetTransform();
     ctx.clearRect(0,0,canvas.width,canvas.height);
     ctx.setTransform(scale,0,0,scale,canvas.width/2,canvas.height/2);
     ctx.lineJoin=ctx.lineCap='round';
     ctx.globalAlpha=reduced ? .7*(1-t) : clamp(t*12)*(1-clamp((t-.48)/.52)**1.5);
     if(reduced||guarded){
      const shield=new Path2D('M-41 -50 Q-41 -61 -30 -61 H30 Q41 -61 41 -50 V50 Q41 61 30 61 H-30 Q-41 61 -41 50Z');
      const offset=guarded&&!reduced?3+5*ease(t):0;
      ctx.save();
      ctx.scale(1+offset/60,1+offset/60);
      streak(ctx,shield,guarded?palettes.bulwark:palette,3.4);
      ctx.restore();
     }
     if(!reduced){
      ctx.save();
      ctx.scale(direction<0?1:-1,1);
      if(guarded)ctx.scale(.8,.8);
      const glow=ctx.createRadialGradient(0,0,0,0,0,62);
      glow.addColorStop(0,palette[1]+'78');
      glow.addColorStop(1,palette[0]+'00');
      fill(ctx,arc(62,0,TAU),glow);
      if(special&&element&&shapes[motif]){
       ctx.save();
       ctx.globalAlpha*=.63;
       ctx.scale(.89,.89);
       shapes[motif](ctx,Math.max(.06,t),palettes[motif]);
       ctx.restore();
      }
      (shapes[type]??slash)(ctx,t,palette);
      ctx.restore();
     }
     requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
   });
  }finally{canvas.remove();}
 }

 window.ArenaImpact={play};
})();
