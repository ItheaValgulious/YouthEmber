import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.youthember.app',
  appName: 'Ember',
  webDir: 'dist',
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
