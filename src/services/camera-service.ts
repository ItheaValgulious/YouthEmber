import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import type { AssetRecord } from '../types/models';
import { fileService } from './file-service';

async function requestImagePermissions(): Promise<void> {
  const permissions = await Camera.checkPermissions();

  if (permissions.camera === 'granted' && permissions.photos === 'granted') {
    return;
  }

  await Camera.requestPermissions({
    permissions: ['camera', 'photos'],
  });
}

export class CameraService {
  async takePhoto(): Promise<AssetRecord | null> {
    await requestImagePermissions();

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
      webUseInput: true,
    });

    return fileService.saveCameraPhoto(photo);
  }

  async pickImages(limit = 6): Promise<AssetRecord[]> {
    await requestImagePermissions();

    try {
      const picked = await Camera.pickImages({
        quality: 90,
        limit,
      });

      const assets: AssetRecord[] = [];

      for (const [index, photo] of picked.photos.entries()) {
        assets.push(await fileService.saveGalleryPhoto(photo, index));
      }

      return assets;
    } catch {
      const singlePhoto = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
        correctOrientation: true,
        webUseInput: true,
      });

      return [await fileService.saveCameraPhoto(singlePhoto)];
    }
  }
}

export const cameraService = new CameraService();
