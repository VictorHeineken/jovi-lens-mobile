import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../../components/Icon.jsx';
import SmartImageSheet from '../../components/SmartImageSheet.jsx';
import { useTopInset } from '../../hooks/safeArea.js';
import { useToast } from '../../shared/toast.js';
import { imageSource } from '../../services/demoAssets.js';
import { useAppData } from '../../context/AppDataContext.jsx';

// `react-native-vision-camera` has no web build, so this file is the browser
// preview stand-in for camera.jsx (Metro prefers `.web.jsx` on web). There is
// no real device here, so the screen always renders the app's existing
// "camera unavailable, pick from library" empty state — same layout and
// controls as native, just without a live feed.
const CAMERA_MODES = ['NOITE', 'VÍDEO', 'FOTO', 'RETRATO', 'MAIS'];
const MORE_MODES = ['DOCUMENTOS', 'PANORAMA', 'MACRO', 'PRO'];
const ZOOM_LEVELS = ['0,6', '1x', '2x', '3x'];

export default function CameraScreen() {
  const router = useRouter();
  const { addRecord, records } = useAppData();
  const topInset = useTopInset(8);
  const overlayTop = topInset + 36 + 20;

  // Flash and recording never actually engage without a real device — kept
  // as plain constants (not state) so the layout below reads the same as the
  // native screen without carrying setters that can never fire.
  const flashOn = false;
  const recording = false;
  const [aspectRatio, setAspectRatio] = useState('4:3');
  const [cameraMode, setCameraMode] = useState('FOTO');
  const [zoom, setZoom] = useState('1x');
  const [lensActive, setLensActive] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cameraMessage, notify] = useToast();
  const [selected, setSelected] = useState(null);
  const [selectedView, setSelectedView] = useState('viewer');
  const [thumbnailErrorFor, setThumbnailErrorFor] = useState(null);
  const [documentSessionId, setDocumentSessionId] = useState(null);
  const [documentPage, setDocumentPage] = useState(0);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { notify('Permita o acesso às fotos para continuar.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const src = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
    await commitCapture(src, { source: 'upload', label: asset.fileName || 'Imagem importada' });
  }

  async function commitCapture(src, { source, label }) {
    const useLens = lensActive;
    const documentMode = cameraMode === 'DOCUMENTOS';
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

  async function capture() {
    if (cameraMode === 'VÍDEO') {
      notify('Gravação de vídeo não está disponível nesta pré-visualização.');
      return;
    }
    await pickFromLibrary();
  }

  function toggleFlash() {
    notify('O flash não está disponível nesta pré-visualização.');
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
    if (nextMode === 'MAIS') { setMoreOpen((current) => !current); return; }
    setMoreOpen(false);
    if (nextMode !== 'DOCUMENTOS') { setDocumentSessionId(null); setDocumentPage(0); }
    setCameraMode(nextMode);
  }

  function finishDocumentSession() {
    setCameraMode('FOTO');
    setMoreOpen(false);
    setDocumentSessionId(null);
    setDocumentPage(0);
    notify('Documento concluído. As páginas ficaram na galeria.');
  }

  const latestPhoto = records.find((record) => record.src && record.mediaType !== 'video') || records.find((record) => record.src);

  return (
    <View className="flex-1 bg-black">
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View
          className="border border-white/40"
          style={{
            width: aspectRatio === '1:1' ? '82%' : aspectRatio === '16:9' ? '92%' : '86%',
            aspectRatio: aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 9 / 16 : 3 / 4,
          }}
        />
      </View>

      <View className="absolute inset-0 items-center justify-center gap-3 bg-slate-950 px-8">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-white/10">
          <Icon name="camera" size={26} color="#ffffff" />
        </View>
        <Text className="text-[12px] font-semibold uppercase tracking-wide text-indigo-300">Câmera JOVI</Text>
        <Text className="text-center text-[19px] font-bold text-white">Use uma foto dos seus estudos</Text>
        <Text className="text-center text-[13px] text-slate-400">Pré-visualização no navegador: a câmera ao vivo não está disponível aqui. Você ainda pode escolher uma imagem.</Text>
        <View className="mt-2 gap-2">
          <Pressable accessibilityRole="button" onPress={pickFromLibrary} className="flex-row items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3">
            <Icon name="gallery" size={18} color="#ffffff" />
            <Text className="text-[14px] font-semibold text-white">Escolher da galeria</Text>
          </Pressable>
        </View>
      </View>

      <View className="absolute left-0 right-0 flex-row items-center justify-center gap-2 px-4" style={{ paddingTop: topInset }}>
        <TopbarButton icon="flash" selected={flashOn} onPress={toggleFlash} label={flashOn ? 'Desligar flash' : 'Ligar flash'} />
        <TopbarButton label={`Alterar proporção, atual ${aspectRatio}`} onPress={toggleAspectRatio} text={aspectRatio} />
        <TopbarButton icon="sparkle" selected={lensActive} onPress={() => setLensActive((c) => !c)} label="Lens" text="Lens" />
        <TopbarButton icon="gallery" onPress={() => router.push('/(tabs)/gallery')} label="Abrir galeria" />
      </View>

      {moreOpen ? (
        <View className="absolute left-4 right-4 gap-2 rounded-2xl bg-black/80 p-3" style={{ top: overlayTop }} accessibilityRole="menu" accessibilityLabel="Mais modos de câmera">
          <Text className="text-[11px] font-semibold text-slate-300">Mais modos</Text>
          <View className="flex-row flex-wrap gap-2">
            {MORE_MODES.map((mode) => {
              const active = cameraMode === mode;
              return (
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  key={mode}
                  onPress={() => chooseMode(mode)}
                  className={`rounded-full px-3 py-1.5 ${active ? 'bg-indigo-600' : 'bg-white/10'}`}
                >
                  <Text className="text-[12px] font-medium text-white">{mode}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {lensActive ? (
        <View className="absolute left-4 right-4 flex-row items-center justify-center gap-1.5 self-center rounded-full bg-indigo-600/90 px-3 py-1.5" style={{ top: overlayTop }}>
          <Icon name="sparkle" size={14} color="#ffffff" />
          <Text className="text-[12px] font-medium text-white">Próxima captura abre o estudo com IA</Text>
        </View>
      ) : null}

      {cameraMode === 'DOCUMENTOS' ? (
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
            const active = cameraMode === mode || (mode === 'MAIS' && MORE_MODES.includes(cameraMode));
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
            accessibilityLabel={lensActive ? 'Capturar e estudar com IA' : cameraMode === 'VÍDEO' ? 'Começar gravação' : cameraMode === 'DOCUMENTOS' ? 'Capturar página do documento' : 'Tirar foto'}
            className={`h-20 w-20 items-center justify-center rounded-full border-4 ${recording ? 'border-red-500' : lensActive ? 'border-indigo-400' : 'border-white'}`}
          >
            <View className={`${recording ? 'h-7 w-7 rounded-md bg-red-500' : 'h-16 w-16 rounded-full bg-white'}`} />
          </Pressable>

          <Pressable onPress={() => notify('Troca de câmera não está disponível nesta pré-visualização.')} accessibilityLabel="Trocar câmera" className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
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
  return <Image source={imageSource(uri)} accessibilityIgnoresInvertColors onError={onError} className="h-full w-full" resizeMode="cover" />;
}
