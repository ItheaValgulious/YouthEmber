import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { GalleryPhoto, Photo } from '@capacitor/camera';

import type { AssetRecord, AssetType } from '../types/models';
import { isNativePlatform, toWebViewPath } from './capacitor/runtime';

export interface ExportedAssetBundle {
  asset_id: string;
  data_url: string;
  filename?: string;
  filepath: string;
  mime_type?: string;
}

interface PersistBinaryOptions {
  assetType: AssetType;
  filename?: string;
  mimeType?: string;
  uploadOrder?: number;
  previewDataUrl?: string;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-');
}

function ensureExtension(filename: string, mimeType?: string): string {
  if (/\.[A-Za-z0-9]+$/.test(filename)) {
    return filename;
  }

  const ext = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
  return `${filename}.${ext}`;
}

function guessAssetType(file: Pick<File, 'type' | 'name'>, hint?: AssetType): AssetType {
  if (hint) {
    return hint;
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  if (file.type.startsWith('audio/')) {
    return 'audio';
  }

  return 'image';
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error('无法解析文件数据');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function textToDataUrl(content: string, mimeType: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function dataUrlToDownload(name: string, dataUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = name;
  anchor.click();
}

async function readImageSize(dataUrl: string): Promise<Pick<AssetRecord, 'width' | 'height'>> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

export class FileService {
  async saveFiles(files: Iterable<File>, hint?: AssetType, uploadOrderStart = 0): Promise<AssetRecord[]> {
    const list = [...files];
    const stored: AssetRecord[] = [];

    for (const [index, file] of list.entries()) {
      stored.push(await this.saveFile(file, hint, uploadOrderStart + index));
    }

    return stored;
  }

  async saveFile(file: File, hint?: AssetType, uploadOrder = 0): Promise<AssetRecord> {
    const dataUrl = await fileToDataUrl(file);
    const { mimeType, base64 } = parseDataUrl(dataUrl);

    return this.persistBinary(base64, {
      assetType: guessAssetType(file, hint),
      filename: file.name,
      mimeType,
      uploadOrder,
      previewDataUrl: dataUrl,
    });
  }

  async saveCameraPhoto(photo: Pick<Photo, 'webPath' | 'dataUrl' | 'base64String' | 'format'>, uploadOrder = 0): Promise<AssetRecord> {
    if (photo.dataUrl) {
      const { mimeType, base64 } = parseDataUrl(photo.dataUrl);
      return this.persistBinary(base64, {
        assetType: 'image',
        filename: `camera-${Date.now()}.${photo.format || 'jpg'}`,
        mimeType,
        uploadOrder,
        previewDataUrl: photo.dataUrl,
      });
    }

    if (photo.base64String) {
      const mimeType = `image/${photo.format || 'jpeg'}`;
      return this.persistBinary(photo.base64String, {
        assetType: 'image',
        filename: `camera-${Date.now()}.${photo.format || 'jpg'}`,
        mimeType,
        uploadOrder,
        previewDataUrl: `data:${mimeType};base64,${photo.base64String}`,
      });
    }

    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const { mimeType, base64 } = parseDataUrl(dataUrl);

      return this.persistBinary(base64, {
        assetType: 'image',
        filename: `camera-${Date.now()}.${photo.format || 'jpg'}`,
        mimeType,
        uploadOrder,
        previewDataUrl: dataUrl,
      });
    }

    throw new Error('拍摄结果为空');
  }

  async saveGalleryPhoto(photo: GalleryPhoto, uploadOrder = 0): Promise<AssetRecord> {
    return this.saveCameraPhoto(
      {
        webPath: photo.webPath,
        format: photo.format,
      },
      uploadOrder,
    );
  }

  async hydrateAsset(asset: AssetRecord): Promise<AssetRecord> {
    if (asset.display_path?.startsWith('data:') || asset.display_path?.startsWith('http')) {
      return { ...asset };
    }

    if (asset.uri) {
      return {
        ...asset,
        display_path: isNativePlatform() ? toWebViewPath(asset.uri) : asset.display_path ?? asset.filepath,
      };
    }

    if (asset.filepath.startsWith('data:') || asset.filepath.startsWith('blob:') || asset.filepath.startsWith('http')) {
      return {
        ...asset,
        display_path: asset.display_path ?? asset.filepath,
      };
    }

    try {
      const { uri } = await Filesystem.getUri({
        path: asset.filepath,
        directory: Directory.Data,
      });

      return {
        ...asset,
        uri,
        display_path: isNativePlatform() ? toWebViewPath(uri) : asset.display_path ?? asset.filepath,
      };
    } catch {
      return {
        ...asset,
        display_path: asset.display_path ?? asset.filepath,
      };
    }
  }

  async readAssetAsDataUrl(asset: AssetRecord): Promise<string> {
    if (asset.display_path?.startsWith('data:')) {
      return asset.display_path;
    }

    if (asset.filepath.startsWith('data:')) {
      return asset.filepath;
    }

    const result = await Filesystem.readFile({
      path: asset.filepath,
      directory: Directory.Data,
    });

    if (result.data instanceof Blob) {
      return blobToDataUrl(result.data);
    }

    return `data:${asset.mime_type ?? 'application/octet-stream'};base64,${result.data}`;
  }

  async removeAsset(asset: AssetRecord): Promise<void> {
    if (!asset.filepath || asset.filepath.startsWith('data:') || asset.filepath.startsWith('blob:')) {
      return;
    }

    try {
      await Filesystem.deleteFile({
        path: asset.filepath,
        directory: Directory.Data,
      });
    } catch {
      // ignore if already deleted
    }
  }

  async exportTextFile(name: string, content: string, mimeType: string): Promise<void> {
    const dataUrl = textToDataUrl(content, mimeType);

    if (!isNativePlatform()) {
      dataUrlToDownload(name, dataUrl);
      return;
    }

    const { base64 } = parseDataUrl(dataUrl);
    const exportPath = `exports/${Date.now()}-${sanitizeFilename(name)}`;
    const writeResult = await Filesystem.writeFile({
      path: exportPath,
      directory: Directory.Cache,
      data: base64,
      recursive: true,
    });

    await Share.share({
      title: name,
      dialogTitle: '导出文件',
      url: writeResult.uri,
    });
  }

  async restoreAsset(bundle: ExportedAssetBundle, baseAsset: AssetRecord): Promise<AssetRecord> {
    const { mimeType, base64 } = parseDataUrl(bundle.data_url);
    const restored = await this.persistBinary(base64, {
      assetType: baseAsset.type,
      filename: bundle.filename ?? baseAsset.filename ?? `${baseAsset.id}`,
      mimeType: bundle.mime_type ?? baseAsset.mime_type ?? mimeType,
      uploadOrder: baseAsset.upload_order,
      previewDataUrl: bundle.data_url,
    });

    return {
      ...restored,
      id: baseAsset.id,
      upload_order: baseAsset.upload_order,
      duration_ms: baseAsset.duration_ms,
      thumbnail_path: baseAsset.thumbnail_path,
    };
  }

  private async persistBinary(base64: string, options: PersistBinaryOptions): Promise<AssetRecord> {
    const safeName = ensureExtension(
      sanitizeFilename(options.filename ?? `${options.assetType}-${Date.now()}`),
      options.mimeType,
    );
    const relativePath = `assets/${options.assetType}/${Date.now()}-${safeName}`;
    const writeResult = await Filesystem.writeFile({
      path: relativePath,
      directory: Directory.Data,
      data: base64,
      recursive: true,
    });

    const record: AssetRecord = {
      id: randomId('asset'),
      filepath: relativePath,
      uri: writeResult.uri,
      display_path: isNativePlatform() ? toWebViewPath(writeResult.uri) : options.previewDataUrl ?? relativePath,
      filename: safeName,
      type: options.assetType,
      upload_order: options.uploadOrder ?? 0,
      mime_type: options.mimeType,
      size_bytes: Math.ceil((base64.length * 3) / 4),
    };

    if (options.assetType === 'image' && options.previewDataUrl) {
      Object.assign(record, await readImageSize(options.previewDataUrl));
    }

    return record;
  }
}

export const fileService = new FileService();
