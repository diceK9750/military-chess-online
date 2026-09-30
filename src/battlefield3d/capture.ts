import type {BattlefieldViewState} from './state';
/** Operates only on rendered public pixels and allowlisted text. Never reads storage or game objects. */
export async function captureScene(image:HTMLCanvasElement,state:BattlefieldViewState,title:string,share=false) {
 const output=document.createElement('canvas');const width=Math.min(1600,image.width),height=Math.round(image.height*width/image.width);
 output.width=width;output.height=height+112;const ctx=output.getContext('2d');if(!ctx)throw new Error('画像保存を利用できません');
 ctx.fillStyle='#182d32';ctx.fillRect(0,0,width,height+112);ctx.drawImage(image,0,0,width,height);
 ctx.fillStyle='#ffe5a0';ctx.font=`bold ${Math.max(18,Math.min(28,width/24))}px sans-serif`;ctx.fillText(title.slice(0,48),20,height+35,width-40);
 ctx.fillStyle='#f7efd8';ctx.font='18px sans-serif';
 const result=state.result?state.result.winner===state.viewer?'勝利':state.result.winner===null?'引き分け':'敗北':'対局中';
 ctx.fillText(`軍人将棋 · 第${state.moveCount}手 · ${result}`,20,height+68,width-40);
 const last=state.lastMove;ctx.font='15px sans-serif';if(last)ctx.fillText(`${last.actor===state.viewer?'自軍':'CPU'} ${last.from} → ${last.to}${last.lane?` (${last.lane}列)`:''}`,20,height+94,width-40);
 const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('PNG生成に失敗しました')),'image/png'));
 const file=new File([blob],`military-chess-scene-${state.moveCount}.png`,{type:'image/png'});
 if(share&&navigator.share&&navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:'軍人将棋 名場面'});return '共有しました';}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return '共有を取消しました';/* Download on a rejected or unsupported share. */}
 }
 const url=URL.createObjectURL(blob);try{const link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return 'PNGを保存しました';
}
