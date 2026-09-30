export type SoundCue='select'|'move'|'analysis'|'battle'|'end';
let context:AudioContext|null=null,enabled=false;
const voices:Readonly<Record<SoundCue,{frequency:number;duration:number;wave:OscillatorType}>>={select:{frequency:320,duration:.065,wave:'triangle'},move:{frequency:190,duration:.12,wave:'triangle'},analysis:{frequency:620,duration:.09,wave:'sine'},battle:{frequency:85,duration:.24,wave:'sawtooth'},end:{frequency:390,duration:.4,wave:'sine'}};
/** Audio is created/resumed only by the explicit settings gesture; failures are optional and silent. */
export async function enableSound(value:boolean):Promise<boolean> {
  enabled=false;
  if(!value){try{await context?.suspend();}catch{/* Optional. */}return false;}
  try { context??=new AudioContext();await context.resume();enabled=true;return true; }catch{return false;}
}
export function playCue(cue:SoundCue) {
  if(!enabled||!context||context.state!=='running')return;
  try {const voice=voices[cue],osc=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
    osc.type=voice.wave;osc.frequency.setValueAtTime(voice.frequency,now);osc.frequency.exponentialRampToValueAtTime(Math.max(40,voice.frequency*.6),now+voice.duration);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.025,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+voice.duration);
    osc.connect(gain);gain.connect(context.destination);osc.start(now);osc.stop(now+voice.duration);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }catch{/* Never affect game transitions. */}
}
export function closeSound(){enabled=false;void context?.close().catch(()=>{});context=null;}

export const AUDIO_DUCK_EVENT='military-chess:celebration-audio';
/** Only the already user-enabled audio context is used; no new autoplay permission. */
export function playVictory() {
  if(!enabled||!context||context.state!=='running')return;
  try {
    window.dispatchEvent(new CustomEvent(AUDIO_DUCK_EVENT));
    const now=context.currentTime;
    [392,523.25,659.25,783.99,1046.5].forEach((frequency,i)=>{
      const osc=context!.createOscillator(),gain=context!.createGain(),start=now+1.25+i*.15;
      osc.type='triangle';osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.035,start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+.45);
      osc.connect(gain);gain.connect(context!.destination);osc.start(start);osc.stop(start+.46);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
    for(let i=0;i<2;i++){
      const osc=context.createOscillator(),gain=context.createGain(),start=now+1.1+i*.5;
      osc.type='triangle';osc.frequency.setValueAtTime(90,start);osc.frequency.exponentialRampToValueAtTime(35,start+.3);gain.gain.setValueAtTime(.035,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.3);osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+.31);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
  }catch{/* Celebration can never affect play or saving. */}
}
