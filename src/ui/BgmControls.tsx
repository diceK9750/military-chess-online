import { useEffect, useRef, useState } from 'react';
import { AUDIO_DUCK_EVENT } from './sound';
export const AUDIO_SETTINGS_KEY = 'military-chess-audio-v1';
type Settings = { enabled: boolean; volume: number };
function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? 'null');
    if (value && typeof value.enabled === 'boolean' && typeof value.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) return { enabled: value.enabled, volume: value.volume };
  } catch { /* Audio preferences must never prevent play. */ }
  return { enabled: false, volume: .25 };
}
export function BgmControls() {
  const [settings, setSettings] = useState(readSettings);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const volume=useRef(settings.volume),ducked=useRef(false);
  volume.current=settings.volume;
  useEffect(() => {
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Optional preference storage. */ }
    if (audio.current) audio.current.volume = settings.volume*(ducked.current?.25:1);
  }, [settings]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const duck=()=>{ducked.current=true;if(audio.current)audio.current.volume=volume.current*.25;clearTimeout(timer);timer=setTimeout(()=>{ducked.current=false;if(audio.current)audio.current.volume=volume.current;},2600);};
    window.addEventListener(AUDIO_DUCK_EVENT,duck);
    return()=>{window.removeEventListener(AUDIO_DUCK_EVENT,duck);clearTimeout(timer);ducked.current=false;};
  },[]);
  useEffect(() => {
    const element = audio.current;
    return () => { request.current++; element?.pause(); };
  }, []);
  async function toggle() {
    const element = audio.current!;
    const id = ++request.current;
    setError('');
    if (playing || pending) { setPending(false); element.pause(); setPlaying(false); setSettings(value => ({ ...value, enabled: false })); return; }
    // Even a saved ON preference requires an explicit gesture after each page load.
    if (!element.getAttribute('src')) element.src = `${import.meta.env.BASE_URL}audio/shenyang.mp3`;
    element.volume = settings.volume;
    setPending(true);
    try {
      await element.play();
      if (id !== request.current) return;
      setPending(false); setPlaying(true); setSettings(value => ({ ...value, enabled: true }));
    } catch { if (id === request.current) { setPending(false); setPlaying(false); setError('BGMを再生できません。もう一度お試しください。'); } }
  }
  return <div className="bgm-controls" aria-label="BGM設定">
    <audio ref={audio} loop preload="none" onError={() => { request.current++; setPending(false); setPlaying(false); setError('BGMを読み込めません。対局は続けられます。'); }} />
    <button className="secondary" aria-pressed={playing} onClick={() => void toggle()}>{pending ? 'BGM 読込中・停止' : playing ? 'BGM OFFにする' : settings.enabled ? 'BGM 再生' : 'BGM ONにする'}</button>
    <label>BGM音量 <input aria-label="BGM音量" type="range" min="0" max="100" step="5" value={Math.round(settings.volume * 100)} onChange={event => setSettings(value => ({ ...value, volume: Number(event.target.value) / 100 }))} /></label>
    {error && <span role="status">{error}</span>}
  </div>;
}
