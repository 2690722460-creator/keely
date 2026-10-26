export const CATEGORIES = [
  {key:'brand_ip',label:'品牌IP',english:'BRAND & IP',color:'#FF3B30'},
  {key:'aigc_video',label:'动态影像',english:'MOTION PICTURE',color:'#FF9500'},
  {key:'ad_visual',label:'视觉创作',english:'VISUAL CREATION',color:'#FFCC00'},
  {key:'stage_design',label:'舞台设计',english:'STAGE DESIGN',color:'#34C759'},
  {key:'personal',label:'UI设计',english:'UI DESIGN',color:'#007AFF'},
  {key:'marketing_clips',label:'营销切片',english:'MARKETING CLIPS',color:'#5856D6'}
];
export const VIDEOS = [
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_030111_a9e15665-d379-4a7f-8116-695bbe452ad1.mp4',
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_171347_f640c30d-ec21-426a-98bc-77e07c2c60cb.mp4',
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260503_104800_bc43ae09-f494-43e3-97d7-2f8c1692cfd7.mp4',
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4',
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_115655_b4d9cd77-feed-43cd-a198-af78ebdf1f7a.mp4',
 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_024928_1efd0b0d-6c02-45a8-8847-1030900c4f63.mp4'
];
export const DETAILS = [
 {number:'4232 8908 1121 4892',name:'ZACHARY MERCER',cvv:'382'},
 {number:'4154 7831 9904 5124',name:'SOPHIA MARTINEZ',cvv:'109'},
 {number:'5457 4120 7733 9035',name:'BENJAMIN CARTER',cvv:'764'},
 {number:'4441 5567 1223 2468',name:'EMILY MORRISON',cvv:'491'},
 {number:'5375 8891 2234 7713',name:'JACKSON REID',cvv:'255'}
];
export const THICKNESS = [-1.47,-0.73,0,0.73,1.47];
export const wrap=(n,count=CATEGORIES.length)=>((n%count)+count)%count;
export const shortestDelta=(from,to,count=CATEGORIES.length)=>wrap(to-from+count/2,count)-count/2;
export const smoothstep=t=>t*t*(3-2*t);
export function calculatePose(i,progress,cardH,height,mx=0,my=0,count=CATEGORIES.length){
 const rounded=Math.round(progress),diff=progress-rounded;
 const virtual=rounded+Math.sign(diff)*Math.pow(Math.abs(diff)*2,4.2)/2;
 const offset=shortestDelta(virtual,i,count);
 const a=Math.abs(offset),sign=Math.sign(offset),D=1350,gap=36,peek=-55;
 let y=0,z=0,rot=0;
 if(a<=1){const t=smoothstep(a);y=-sign*t*(cardH+gap);z=400+t*(220-400);rot=t*132;}
 else if(a<=2){
  const t=smoothstep(a-1),zEnd=-60,sEnd=D/(D-zEnd),end=(height/2-peek)/sEnd-cardH/2;
  y=-sign*((cardH+gap)+t*(end-cardH-gap));z=220+t*(zEnd-220);rot=132+t*(175-132);
 }else{
  const t=smoothstep(Math.min(a-2,1)),start=(height/2-peek)/(D/(D+60))-cardH/2,end=(height/2+100)/(D/(D+250))+cardH/2;
  y=-sign*(start+t*(end-start));z=-60+t*(-250+60);rot=175+t*(195-175);
 }
 const center=Math.max(0,1-a),rx=-sign*rot-my*12*center,ry=mx*15*center;
 return {offset,absOffset:a,y,z,rx,ry,visible:a<=3,front:Math.cos(rx*Math.PI/180)>=0,
  transform:`translateY(${y.toFixed(2)}px) translateZ(${z.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(-3deg)`};
}
