import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission, usePhotoOutput, useVideoOutput } from 'react-native-vision-camera';
import Icon from '../../components/Icon.jsx';
import SmartImageSheet from '../../components/SmartImageSheet.jsx';
import { useTopInset } from '../../hooks/safeArea.js';
import { useToast } from '../../shared/toast.js';
import { IMAGE_FILL, imageSource } from '../../services/demoAssets.js';
import { useAppData } from '../../context/AppDataContext.jsx';
import { MEDIA_DIR, ensureMediaDirExists } from '../../services/storage.js';
import { framingAspect, getAspectCrop } from '../../shared/cameraCrop.js';

// Only modes that change what gets captured. Noite/Retrato/Panorama/Macro/Pro
// used to be listed too, but selecting them changed nothing — a camera mode
// that silently does nothing is worse than not offering it.
const CAMERA_MODES = ['VÍDEO', 'FOTO', 'DOCUMENTO'];
const ZOOM_LEVELS = ['0,6', '1x', '2x', '3x'];
const ZOOM_TARGETS = { '0,6': 0.6, '1x': 1, '2x': 2, '3x': 3 };
const FLASH_CYCLE = { off: 'auto', auto: 'on', on: 'off' };
const FLASH_LABEL = { off: 'Flash desligado', auto: 'Flash automático', on: 'Flash ligado' };

// Vision-camera does real (often optical/hybrid) zoom via the `zoom` prop, so
// the captured frame is already zoomed; only the aspect crop remains, and it
// lives in shared/cameraCrop.js so the preview frame and the saved file agree.

// capturePhoto() reports the sensor's own width/height, but the file written by
// saveToTemporaryFileAsync() is already EXIF-rotated — so on a portrait shot the
// two are transposed and a crop computed from the sensor size falls outside the
// image. Measure the file that will actually be cropped.
function measureImage(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export default function CameraScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { addRecord, records } = useAppData();
  // Tighter gap than a scrolling screen: this is a control bar floating over
  // the full-bleed camera preview, not page content.
  const topInset = useTopInset(8);
  // The overlays below the top bar used to be pinned at a hardcoded `top-28`
  // (112px), a number that silently depended on the old `pt-14`: 56 + the bar's
  // own h-9 (36) + a 20px gap. Derive it so the gap stays 20px at any inset
  // instead of drifting with the device.
  const overlayTop = topInset + 36 + 20;
  const cameraRef = useRef(null);
  const recorderRef = useRef(null);

  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const microphone = useMicrophonePermission();
  const [facing, setFacing] = useState('back');
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput();
  // Video records sound when the microphone is allowed (asked when the student
  // switches to VÍDEO); without it the recording still works, silently. The
  // flag only follows the permission while NOT recording: changing it
  // recreates the output, which would orphan a recording in progress.
  const [videoAudio, setVideoAudio] = useState(microphone.hasPermission);
  const videoOutput = useVideoOutput({ enableAudio: videoAudio });

  const [flashMode, setFlashMode] = useState('off');
  const [torchOn, setTorchOn] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('4:3');
  const [cameraMode, setCameraMode] = useState('FOTO');
  const [zoom, setZoom] = useState('1x');
  const [lensActive, setLensActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraMessage, notify] = useToast();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [thumbnailErrorFor, setThumbnailErrorFor] = useState(null);
  const [documentSessionId, setDocumentSessionId] = useState(null);
  const [documentPage, setDocumentPage] = useState(0);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  useEffect(() => {
    if (!recording) setVideoAudio(microphone.hasPermission);
  }, [microphone.hasPermission, recording]);

  function zoomValue() {
    if (!device) return 1;
    const target = ZOOM_TARGETS[zoom] ?? 1;
    return Math.min(device.maxZoom, Math.max(device.minZoom, target));
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { notify('Permita o acesso às fotos para continuar.'); return; }
    // No base64: the picker's file is copied into the app's media folder by
    // addRecord, instead of round-tripping megabytes through a JS string.
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    try {
      await commitCapture(asset.uri, { source: 'upload', label: asset.fileName || 'Imagem importada' });
    } catch (error) {
      notify(error.message || 'Não foi possível importar essa imagem.');
    }
  }

  async function commitCapture(src, { source, label }) {
    const useLens = lensActive;
    const documentMode = cameraMode === 'DOCUMENTO';
    const nextPage = documentPage + 1;
    const sessionId = documentSessionId || `document-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record = await addRecord({
      src,
      source,
      label: documentMode ? `Documento · Página ${nextPage}` : label,
      collectionId: documentMode ? sessionId : null,
      pageNumber: documentMode ? nextPage : null,
    });
    if (documentMode) {
      setDocumentSessionId(sessionId);
      setDocumentPage(nextPage);
    }
    setLensActive(false);
    if (useLens) {
      setSelectedView('study');
      setSelected(record);
    } else if (documentMode) {
      notify(`Página ${nextPage} salva. Capture a próxima ou conclua o documento.`);
    } else {
      notify('Foto salva na galeria.');
    }
    return record;
  }

  async function takePicture() {
    if (!cameraRef.current || !device) { await pickFromLibrary(); return; }
    setBusy(true);
    let photo;
    const temporaryFiles = [];
    try {
      photo = await photoOutput.capturePhoto({ flashMode: device.hasFlash ? flashMode : 'off' }, {});
      const tempPath = await photo.saveToTemporaryFileAsync();
      const fileUri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
      temporaryFiles.push(fileUri);
      const { width, height } = await measureImage(fileUri);
      const crop = getAspectCrop(width, height, aspectRatio);
      const manipulated = await ImageManipulator.manipulateAsync(
        fileUri,
        [{ crop }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 },
      );
      temporaryFiles.push(manipulated.uri);
      await commitCapture(manipulated.uri, { source: 'camera', label: cameraMode === 'DOCUMENTO' ? 'Documento' : 'Captura da câmera' });
    } catch (error) {
      // Swallowing this made a real failure invisible on device; log it so
      // `adb logcat` shows why a capture was dropped.
      console.error('[JOVI] takePicture failed:', error?.message ?? String(error), error?.stack ?? '');
      notify('Não foi possível salvar essa captura.');
    } finally {
      photo?.dispose();
      setBusy(false);
      // addRecord copied the result into the media folder; the camera's raw
      // file and the crop output would otherwise pile up in the cache.
      temporaryFiles.forEach((uri) => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}));
    }
  }

  async function beginVideoRecording() {
    if (!device) return;
    try {
      await ensureMediaDirExists();
      const filePath = `${MEDIA_DIR.replace('file://', '')}video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
      const recorder = await videoOutput.createRecorder({ filePath });
      recorderRef.current = recorder;
      await recorder.startRecording(
        async (finishedPath) => {
          recorderRef.current = null;
          setRecording(false);
          try {
            const record = await addRecord({ src: finishedPath.startsWith('file://') ? finishedPath : `file://${finishedPath}`, source: 'camera', label: 'Vídeo da câmera', aiAvailable: false, mediaType: 'video' });
            if (record) { setSelectedView('viewer'); setSelected(record); }
          } catch (error) {
            notify(error.message || 'Não foi possível salvar o vídeo.');
          }
        },
        () => { recorderRef.current = null; setRecording(false); notify('Não foi possível gravar o vídeo.'); },
      );
      setRecording(true);
      notify('Gravando vídeo. Toque no obturador para finalizar.');
    } catch {
      notify('Não foi possível iniciar a gravação.');
    }
  }

  async function endVideoRecording() {
    try { await recorderRef.current?.stopRecording(); } catch { /* already stopped */ }
  }

  async function capture() {
    if (cameraMode === 'VÍDEO') {
      if (recording) await endVideoRecording();
      else await beginVideoRecording();
      return;
    }
    await takePicture();
  }

  // Photo: a real flash (off → auto → on) fired at capture. Video: the torch,
  // the only light a recording can use. It used to always toggle the torch
  // and capture with the flash forced off.
  function toggleFlash() {
    if (cameraMode === 'VÍDEO') {
      if (!device?.hasTorch) { notify('A lanterna não está disponível nesta câmera.'); return; }
      setTorchOn((current) => !current);
      return;
    }
    if (!device?.hasFlash) { notify('O flash não está disponível nesta câmera.'); return; }
    const next = FLASH_CYCLE[flashMode];
    setFlashMode(next);
    notify(FLASH_LABEL[next]);
  }

  function toggleAspectRatio() {
    setAspectRatio((current) => (current === '4:3' ? '16:9' : current === '16:9' ? '1:1' : '4:3'));
  }

  function openLatestPhoto() {
    if (!latestPhoto) { pickFromLibrary(); return; }
    setSelectedView('viewer');
    setSelected(latestPhoto);
  }

  function chooseMode(nextMode) {
    if (recording && nextMode !== 'VÍDEO') { notify('Finalize o vídeo antes de trocar de modo.'); return; }
    if (nextMode !== 'DOCUMENTO') { setDocumentSessionId(null); setDocumentPage(0); }
    if (nextMode !== 'VÍDEO') setTorchOn(false);
    if (nextMode === 'VÍDEO' && !microphone.hasPermission && microphone.canRequestPermission) microphone.requestPermission();
    setCameraMode(nextMode);
  }

  function finishDocumentSession() {
    setCameraMode('FOTO');
    setDocumentSessionId(null);
    setDocumentPage(0);
    notify('Documento concluído. As páginas ficaram na galeria.');
  }

  function focusAt(event) {
    const { locationX, locationY } = event.nativeEvent;
    cameraRef.current?.focusTo?.({ x: locationX, y: locationY }).catch(() => {});
  }

  const cameraReady = hasPermission && !!device;
  const permanentlyDenied = !hasPermission && !canRequestPermission;
  const unavailable = permanentlyDenied || (hasPermission && !device);
  const latestPhoto = records.find((record) => record.src && record.mediaType !== 'video') || records.find((record) => record.src);

  return (
    <View className="flex-1 bg-black">
      {isFocused ? <StatusBar style="light" /> : null}
      {/* The Pressable below is the full-bleed tap-to-focus surface over the
          preview. It is not a button: without a label a screen reader announced
          only "button" across the whole screen, and the focus gesture is exactly
          the kind of non-obvious action an accessibilityHint exists for. */}
      {cameraReady ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Visor da câmera"
          accessibilityHint="Toque para focar no ponto desejado"
          style={StyleSheet.absoluteFill}
          onPress={focusAt}
        >
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isFocused}
            outputs={[photoOutput, videoOutput]}
            zoom={zoomValue()}
            torchMode={cameraMode === 'VÍDEO' && torchOn ? 'on' : 'off'}
          />
        </Pressable>
      ) : null}

      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View
          className="border border-white/40"
          style={{
            width: aspectRatio === '1:1' ? '82%' : aspectRatio === '16:9' ? '92%' : '86%',
            aspectRatio: framingAspect(aspectRatio),
          }}
        />
      </View>

      {unavailable ? (
        <View className="absolute inset-0 items-center justify-center gap-3 bg-slate-950 px-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/10">
            <Icon name="camera" size={26} color="#ffffff" />
          </View>
          <Text className="text-[12px] font-semibold uppercase tracking-wide text-indigo-300">Câmera JOVI</Text>
          <Text className="text-center text-[19px] font-bold text-white">{permanentlyDenied ? 'Libere a câmera para começar' : 'Use uma foto dos seus estudos'}</Text>
          <Text className="text-center text-[13px] text-slate-400">{permanentlyDenied ? 'O JOVI Lens precisa de acesso à câmera para mostrar o preview ao vivo.' : 'Seu aparelho não liberou a câmera agora. Você ainda pode escolher uma imagem.'}</Text>
          <View className="mt-2 gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => (permanentlyDenied ? Linking.openSettings() : requestPermission())}
              className="flex-row items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3"
            >
              <Icon name={permanentlyDenied ? 'lock' : 'rotate'} size={18} color="#ffffff" />
              <Text className="text-[14px] font-semibold text-white">{permanentlyDenied ? 'Abrir configurações' : 'Tentar novamente'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={pickFromLibrary} className="flex-row items-center justify-center gap-1.5 rounded-full border border-white/30 px-5 py-3">
              <Icon name="gallery" size={18} color="#ffffff" />
              <Text className="text-[14px] font-semibold text-white">Escolher da galeria</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!cameraReady && !unavailable ? (
        <View className="absolute inset-0 items-center justify-center gap-2 bg-black">
          <Text className="text-[13px] text-slate-300">Preparando a câmera…</Text>
        </View>
      ) : null}

      <View className="absolute left-0 right-0 flex-row items-center justify-center gap-2 px-4" style={{ paddingTop: topInset }}>
        <TopbarButton
          icon="flash"
          selected={cameraMode === 'VÍDEO' ? torchOn : flashMode !== 'off'}
          text={cameraMode === 'VÍDEO' ? null : flashMode === 'auto' ? 'A' : null}
          onPress={toggleFlash}
          label={cameraMode === 'VÍDEO' ? (torchOn ? 'Desligar lanterna' : 'Ligar lanterna') : `${FLASH_LABEL[flashMode]}. Toque para alterar`}
        />
        <TopbarButton label={`Alterar proporção, atual ${aspectRatio}`} onPress={toggleAspectRatio} text={aspectRatio} />
        <TopbarButton icon="sparkle" selected={lensActive} onPress={() => setLensActive((c) => !c)} label="Lens" text="Lens" />
        {/* "Mais configurações" was removed here: it only flashed its own name as a
            toast and opened nothing. Same reason as the gallery header — a control
            that reports an outcome it did not produce is worse than its absence. */}
        <TopbarButton icon="gallery" onPress={() => router.push('/(tabs)/gallery')} label="Abrir galeria" />
      </View>

      {lensActive ? (
        <View className="absolute left-4 right-4 flex-row items-center justify-center gap-1.5 self-center rounded-full bg-indigo-600/90 px-3 py-1.5" style={{ top: overlayTop }}>
          <Icon name="sparkle" size={14} color="#ffffff" />
          <Text className="text-[12px] font-medium text-white">Próxima captura abre o estudo com IA</Text>
        </View>
      ) : null}

      {cameraMode === 'DOCUMENTO' ? (
        <View className="absolute left-4 right-4 flex-row items-center justify-between gap-2 rounded-2xl bg-black/70 px-3 py-2.5" style={{ top: overlayTop }}>
          <View className="flex-row items-center gap-2">
            <Icon name="scan" size={16} color="#ffffff" />
            <View>
              <Text className="text-[13px] font-bold text-white">Scanner de documentos</Text>
              <Text className="text-[11px] text-slate-300">{documentPage ? `${documentPage} ${documentPage === 1 ? 'página salva' : 'páginas salvas'}` : 'Capture a primeira página'}</Text>
            </View>
          </View>
          {documentPage > 0 ? (
            <Pressable accessibilityRole="button" onPress={finishDocumentSession} className="rounded-full bg-indigo-600 px-3 py-1.5">
              <Text className="text-[12px] font-semibold text-white">Concluir</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="absolute bottom-0 left-0 right-0 gap-3 pb-8 pt-4">
        <View className="flex-row justify-center gap-2">
          {ZOOM_LEVELS.map((level) => {
            const active = zoom === level;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={level}
                onPress={() => setZoom(level)}
                className={`h-8 min-w-8 items-center justify-center rounded-full px-2 ${active ? 'bg-white' : 'bg-white/15'}`}
              >
                <Text className={`text-[12px] font-semibold ${active ? 'text-black' : 'text-white'}`}>{level}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row justify-center gap-4 px-4" accessibilityLabel="Modos da câmera">
          {CAMERA_MODES.map((mode) => {
            const active = cameraMode === mode;
            return (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={mode} onPress={() => chooseMode(mode)}>
                <Text className={`text-[12px] font-semibold ${active ? 'text-amber-400' : 'text-white/70'}`}>{mode}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row items-center justify-between px-8">
          <Pressable onPress={openLatestPhoto} accessibilityLabel={latestPhoto ? 'Abrir última foto' : 'Abrir galeria'} className="h-11 w-11 overflow-hidden rounded-xl border border-white/40 bg-white/10">
            {latestPhoto?.src && thumbnailErrorFor !== latestPhoto.id ? (
              <ThumbImage uri={latestPhoto.src} onError={() => setThumbnailErrorFor(latestPhoto.id)} />
            ) : (
              <View className="h-full w-full items-center justify-center"><Icon name={latestPhoto ? 'image' : 'gallery'} size={20} color="#ffffff" /></View>
            )}
          </Pressable>

          <Pressable
            onPress={capture}
            disabled={busy}
            accessibilityLabel={recording ? 'Parar gravação' : lensActive ? 'Capturar e estudar com IA' : cameraMode === 'VÍDEO' ? 'Começar gravação' : cameraMode === 'DOCUMENTO' ? 'Capturar página do documento' : 'Tirar foto'}
            className={`h-20 w-20 items-center justify-center rounded-full border-4 ${recording ? 'border-red-500' : lensActive ? 'border-indigo-400' : 'border-white'}`}
          >
            <View className={`${recording ? 'h-7 w-7 rounded-md bg-red-500' : 'h-16 w-16 rounded-full bg-white'}`} />
          </Pressable>

          <Pressable onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))} accessibilityLabel="Trocar câmera" className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Icon name="rotate" size={22} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {cameraMessage ? (
        <View className="absolute bottom-44 left-4 right-4 flex-row items-center justify-center gap-2 rounded-full bg-black/80 px-4 py-2.5">
          <Icon name="info" size={16} color="#ffffff" />
          <Text className="text-[13px] font-medium text-white">{cameraMessage}</Text>
        </View>
      ) : null}

      {selected ? <SmartImageSheet record={selected} initialView={selectedView} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

function TopbarButton({ icon, text, selected, onPress, label }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} className={`h-9 min-w-9 flex-row items-center justify-center gap-1 rounded-full px-2.5 ${selected ? 'bg-indigo-600' : 'bg-black/45'}`}>
      {icon ? <Icon name={icon} size={17} color="#ffffff" /> : null}
      {text ? <Text className="text-[12px] font-semibold text-white">{text}</Text> : null}
    </Pressable>
  );
}

function ThumbImage({ uri, onError }) {
  // `uri` can be a seeded sample's /demo-assets path on a fresh install, so it
  // goes through the same resolver as every other image in the app.
  return <Image source={imageSource(uri)} accessibilityIgnoresInvertColors onError={onError} style={IMAGE_FILL} resizeMode="cover" resizeMethod="resize" />;
}

// A crash here stays inside this tab (the tab bar keeps working).
export { default as ErrorBoundary } from '../../components/ErrorScreen.jsx';
