export type ProfileImageKind = 'avatar' | 'banner' | 'group';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const settings = {
  avatar: { width: 512, height: 512, maxBytes: 500 * 1024 },
  group: { width: 512, height: 512, maxBytes: 500 * 1024 },
  banner: { width: 1200, height: 400, maxBytes: 1200 * 1024 },
} as const;

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem processada.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a imagem.'))),
      'image/webp',
      quality,
    ),
  );
}

export async function prepareProfileImage(file: File, kind: ProfileImageKind) {
  if (!supportedTypes.has(file.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original deve ter no máximo 12 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('O arquivo selecionado não é uma imagem válida.');
  }

  try {
    const { width, height, maxBytes } = settings[kind];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Não foi possível preparar a imagem neste dispositivo.');

    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (bitmap.width - sourceWidth) / 2;
    const sourceY = (bitmap.height - sourceHeight) / 2;
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

    let quality = 0.88;
    let blob = await canvasBlob(canvas, quality);
    while (blob.size > maxBytes && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, quality);
    }
    if (blob.size > maxBytes)
      throw new Error('A imagem ficou muito grande mesmo após a otimização. Escolha outra imagem.');
    return toDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
