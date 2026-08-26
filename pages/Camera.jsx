import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { fileToDataUrl, prepareImageForAI } from '../services/imageAnalysis.js';

export default function Camera() {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const { addRecord } = useAppData();
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraState, setCameraState] = useState('starting');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unsupported');
        return;
      }
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState('ready');
      } catch {
        if (active) setCameraState('denied');
      }
    }
    start();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

  async function capture() {
    const video = videoRef.current;
    if (!video || cameraState !== 'ready' || !video.videoWidth) {
      fileRef.current?.click();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = await prepareImageForAI(canvas.toDataURL('image/jpeg', 0.92));
    const record = await addRecord({ src: dataUrl, source: 'camera', label: 'Captura' });
    setSelected(record);
  }

  async function pickFile(event) {
    const file = event.target.files?.[0];
    if (!file?.type.startsWith('image/')) return;
    const raw = await fileToDataUrl(file);
    const src = await prepareImageForAI(raw);
    const record = await addRecord({ src, source: 'upload', label: file.name });
    setSelected(record);
    event.target.value = '';
  }

  const unavailable = cameraState === 'denied' || cameraState === 'unsupported';

  return (
    <main className="camera-page">
      <video ref={videoRef} className="camera-feed" playsInline muted />
      {unavailable && (
        <div className="camera-fallback">
          <Icon name="camera" size={36} />
          <h1>{cameraState === 'denied' ? 'Permita acesso à câmera' : 'Câmera não disponível'}</h1>
          <p>Você ainda pode escolher uma imagem do aparelho e usar todo o fluxo inteligente.</p>
          <button onClick={() => fileRef.current?.click()}><Icon name="gallery" size={18} /> Escolher foto</button>
        </div>
      )}
      {cameraState === 'starting' && <div className="camera-loading">Abrindo câmera...</div>}

      <div className="camera-topbar">
        <div className="brand-pill"><span className="brand-dot" />JOVI <b>Lens</b></div>
        <button className="glass-button" onClick={() => fileRef.current?.click()} aria-label="Abrir galeria"><Icon name="gallery" size={19} /></button>
      </div>

      <div className="focus-guide">
        <span /><span /><span /><span />
        <div>Aponte para qualquer texto</div>
      </div>

      <div className="camera-controls">
        <button className="control-secondary" onClick={() => fileRef.current?.click()}><Icon name="gallery" /></button>
        <button className="shutter" onClick={capture} aria-label="Tirar foto"><span /></button>
        <button className="control-secondary" onClick={() => setFacingMode((mode) => mode === 'environment' ? 'user' : 'environment')}><Icon name="rotate" /></button>
      </div>
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" onChange={pickFile} />
      {selected && <SmartImageSheet record={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
