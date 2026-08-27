import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import SmartImageSheet from '../components/SmartImageSheet.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { fileToDataUrl } from '../services/imageAnalysis.js';

const CAMERA_MODES = ['NOITE', 'VÍDEO', 'FOTO', 'RETRATO', 'MAIS'];
const ZOOM_LEVELS = ['0,6', '1x', '2x', '3x'];

function getZoomScale(level) {
  return { '0,6': 0.88, '1x': 1, '2x': 1.55, '3x': 2.15 }[level] || 1;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getCaptureCrop(video, ratio, zoomScale) {
  const targetRatio = ratio.split(':').map(Number);
  const desiredRatio = targetRatio[0] / targetRatio[1];
  const videoRatio = video.videoWidth / video.videoHeight;
  const baseWidth = videoRatio > desiredRatio ? video.videoHeight * desiredRatio : video.videoWidth;
  const baseHeight = videoRatio > desiredRatio ? video.videoHeight : video.videoWidth / desiredRatio;
  const width = Math.min(video.videoWidth, baseWidth / Math.max(1, zoomScale));
  const height = Math.min(video.videoHeight, baseHeight / Math.max(1, zoomScale));
  return {
    sourceX: (video.videoWidth - width) / 2,
    sourceY: (video.videoHeight - height) / 2,
    width,
    height,
  };
}

export default function Camera() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const { addRecord, records } = useAppData();
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraState, setCameraState] = useState('starting');
  const [cameraMessage, setCameraMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [flashOn, setFlashOn] = useState(false);
  const [hdrOn, setHdrOn] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('4:3');
  const [cameraMode, setCameraMode] = useState('FOTO');
  const [zoom, setZoom] = useState('1x');
  const [lensActive, setLensActive] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [thumbnailErrorFor, setThumbnailErrorFor] = useState(null);

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
        setCameraMessage('');
      } catch (error) {
        if (!active) return;
        const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
        setCameraState(denied ? 'denied' : 'unavailable');
        setCameraMessage(denied ? 'Permissão da câmera desativada' : 'A câmera não respondeu');
      }
    }
    start();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

  function notify(message) {
    setCameraMessage(message);
    window.setTimeout(() => setCameraMessage(''), 2600);
  }

  function startVideoRecording() {
    if (!window.MediaRecorder || !streamRef.current) {
      notify('A gravação de vídeo não está disponível neste navegador.');
      return;
    }
    const supportedType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => window.MediaRecorder.isTypeSupported?.(type));
    const recorder = supportedType ? new window.MediaRecorder(streamRef.current, { mimeType: supportedType }) : new window.MediaRecorder(streamRef.current);
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) recordingChunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setRecording(false);
      notify('Não foi possível gravar o vídeo.');
    };
    recorder.onstop = async () => {
      try {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const src = await blobToDataUrl(blob);
        const record = await addRecord({ src, source: 'camera', label: 'Vídeo da câmera', aiAvailable: false, mediaType: 'video' });
        setSelectedView('viewer');
        setSelected(record);
      } catch {
        notify('Não foi possível salvar o vídeo.');
      } finally {
        recordingChunksRef.current = [];
        setRecording(false);
        recorderRef.current = null;
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    notify('Gravando vídeo. Toque no obturador para finalizar.');
  }

  function stopVideoRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  async function capture({ useLens = lensActive } = {}) {
    if (cameraMode === 'VÍDEO') {
      if (recording) stopVideoRecording();
      else startVideoRecording();
      return;
    }
    const video = videoRef.current;
    if (!video || cameraState !== 'ready' || !video.videoWidth) {
      fileRef.current?.click();
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const crop = getCaptureCrop(video, aspectRatio, getZoomScale(zoom));
      canvas.width = Math.round(crop.width);
      canvas.height = Math.round(crop.height);
      canvas.getContext('2d').drawImage(video, crop.sourceX, crop.sourceY, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const record = await addRecord({ src: dataUrl, source: 'camera', label: 'Captura da câmera' });
      setLensActive(false);
      if (useLens) {
        setSelectedView('study');
        setSelected(record);
      } else {
        notify('Foto salva na galeria.');
      }
    } catch {
      notify('Não foi possível salvar essa captura.');
    }
  }

  async function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const useLens = lensActive;
    try {
      const src = await fileToDataUrl(file);
      const record = await addRecord({ src, source: 'upload', label: file.name });
      setLensActive(false);
      if (useLens) {
        setSelectedView('study');
        setSelected(record);
      } else {
        notify('Foto salva na galeria.');
      }
    } catch (error) {
      notify(error.message || 'Escolha uma imagem válida para continuar.');
    }
  }

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.();
    if (!capabilities?.torch) {
      notify('O flash não está disponível neste dispositivo.');
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashOn }] });
      setFlashOn((current) => !current);
    } catch {
      notify('Não foi possível controlar o flash agora.');
    }
  }

  function toggleAspectRatio() {
    setAspectRatio((current) => current === '4:3' ? '16:9' : current === '16:9' ? '1:1' : '4:3');
  }

  function openLatestPhoto() {
    if (!latestPhoto) {
      fileRef.current?.click();
      return;
    }
    setSelectedView('viewer');
    setSelected(latestPhoto);
  }

  function chooseMode(nextMode) {
    if (recording && nextMode !== 'VÍDEO') {
      notify('Finalize o vídeo antes de trocar de modo.');
      return;
    }
    if (nextMode === 'MAIS') {
      setMoreOpen((current) => !current);
      return;
    }
    setMoreOpen(false);
    setCameraMode(nextMode);
  }

  const unavailable = cameraState === 'denied' || cameraState === 'unsupported' || cameraState === 'unavailable';
  const latestPhoto = records.find((record) => record.src && record.mediaType !== 'video') || records.find((record) => record.src);
  const zoomScale = getZoomScale(zoom);
  const cameraClassName = `camera-page origin-camera aspect-${aspectRatio.replace(':', '-')}${cameraMode === 'NOITE' ? ' camera-night' : ''}${cameraMode === 'RETRATO' ? ' camera-portrait' : ''}${recording ? ' is-recording' : ''}`;

  return (
    <main className={`${cameraClassName}${unavailable ? ' camera-unavailable' : ''}`}>
      <video ref={videoRef} className="camera-feed" style={{ transform: `scale(${zoomScale})` }} playsInline muted autoPlay />
      <div className={`origin-aspect-guide ratio-${aspectRatio.replace(':', '-')}`} aria-hidden="true" />
      {unavailable && <div className="camera-fallback"><div className="fallback-mark"><Icon name="camera" size={26} /></div><span className="mode-kicker">Câmera JOVI</span><h1>{cameraState === 'denied' ? 'Libere a câmera para começar' : 'Use uma foto dos seus estudos'}</h1><p>{cameraState === 'denied' ? 'A câmera do JOVI Lens precisa de acesso para mostrar o preview ao vivo.' : 'Seu aparelho não liberou a câmera agora. Você ainda pode escolher uma imagem.'}</p><button onClick={() => fileRef.current?.click()}><Icon name="gallery" size={18} /> Escolher da galeria</button></div>}
      {cameraState === 'starting' && <div className="camera-loading"><span className="loading-orbit" /> Preparando a câmera</div>}

      <div className="origin-camera-topbar">
        <div className="origin-camera-toolbar" aria-label="Controles da câmera">
          <button className={`origin-camera-control ${flashOn ? 'selected' : ''}`} onClick={toggleFlash} aria-label={flashOn ? 'Desligar flash' : 'Ligar flash'}><Icon name="flash" size={18} /></button>
          <button className={`origin-camera-control ${hdrOn ? 'selected' : ''}`} onClick={() => setHdrOn((current) => !current)} aria-pressed={hdrOn}>HDR</button>
          <button className="origin-camera-control origin-camera-aspect" onClick={toggleAspectRatio} aria-label={`Alterar proporção, atual ${aspectRatio}`}>{aspectRatio}</button>
          <button className={`origin-camera-control origin-lens-control ${lensActive ? 'selected' : ''}`} onClick={() => setLensActive((current) => !current)} aria-pressed={lensActive}><Icon name="sparkle" size={17} /><span>Lens</span></button>
          <button className="origin-camera-control" onClick={() => notify('Configurações da câmera JOVI')} aria-label="Mais configurações"><Icon name="more" size={19} /></button>
          <button className="origin-camera-control" onClick={() => navigate('/gallery')} aria-label="Abrir galeria"><Icon name="gallery" size={18} /></button>
        </div>
      </div>

      <div className="origin-camera-focus" aria-hidden="true"><span /><span /><span /><span /><i /></div>
      {moreOpen && <div className="origin-more-modes" role="dialog" aria-label="Mais modos de câmera"><span>Mais modos</span><div>{['DOCUMENTOS', 'PANORAMA', 'MACRO', 'PRO'].map((mode) => <button key={mode} onClick={() => { setCameraMode(mode); setMoreOpen(false); }}>{mode}</button>)}</div></div>}
      {lensActive && <div className="origin-camera-lens-hint"><Icon name="sparkle" size={14} /> Próxima captura abre o estudo com IA</div>}

      <div className="origin-camera-bottom">
        <div className="origin-camera-zoom" aria-label="Zoom da câmera">
          {ZOOM_LEVELS.map((level) => <button key={level} className={zoom === level ? 'active' : ''} onClick={() => setZoom(level)}>{level}</button>)}
        </div>
        <div className="origin-camera-mode-strip" aria-label="Modos da câmera">
          {CAMERA_MODES.map((mode) => <button key={mode} className={cameraMode === mode ? 'active' : ''} onClick={() => chooseMode(mode)}>{mode}</button>)}
        </div>
        <div className="origin-camera-controls">
          <button className="origin-camera-thumbnail" onClick={openLatestPhoto} aria-label={latestPhoto ? 'Abrir última foto' : 'Abrir galeria'}>
            {latestPhoto && thumbnailErrorFor !== latestPhoto.id ? <img src={latestPhoto.src} alt="Última captura" onError={() => setThumbnailErrorFor(latestPhoto.id)} /> : <Icon name={latestPhoto ? 'image' : 'gallery'} size={20} />}
          </button>
          <button className={`origin-shutter${lensActive ? ' lens-ready' : ''}${recording ? ' recording' : ''}`} onClick={() => capture()} aria-label={recording ? 'Parar gravação' : lensActive ? 'Capturar e estudar com IA' : cameraMode === 'VÍDEO' ? 'Começar gravação' : 'Tirar foto'}><span /></button>
          <button className="origin-camera-switch" onClick={() => setFacingMode((mode) => mode === 'environment' ? 'user' : 'environment')} aria-label="Trocar câmera"><Icon name="rotate" size={22} /></button>
        </div>
      </div>

      {cameraMessage && <div className="camera-toast" role="status"><Icon name="info" size={16} /> {cameraMessage}</div>}
      <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} />
      {selected && <SmartImageSheet record={selected} initialView={selectedView} onClose={() => setSelected(null)} />}
    </main>
  );
}
