import { useEffect, useState } from 'react';
import { closeSound, enableSound, playCue } from './sound';
export function SoundControls(){
 const [enabled,setEnabled]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>closeSound(),[]);
 return <div className="sound-controls"><button className="secondary" aria-pressed={enabled} onClick={()=>{void enableSound(!enabled).then(value=>{setEnabled(value);setError(!enabled&&!value?'効果音は利用できません。対局は続けられます。':'');if(value)playCue('select');});}}>効果音 {enabled?'OFFにする':'ONにする'}</button>{error&&<small role="status">{error}</small>}</div>;
}
