import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ashdairy.app',
  appName: 'AshDiary',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    Camera: {
      promptLabelHeader: '选择图片来源',
      promptLabelCancel: '取消',
      promptLabelPhoto: '从相册选择',
      promptLabelPicture: '立即拍摄',
    },
  },
};

export default config;
