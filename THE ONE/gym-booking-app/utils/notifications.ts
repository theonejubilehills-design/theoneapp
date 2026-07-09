import { Platform } from 'react-native';

/**
 * Requests push notification permissions and returns the Expo push token.
 * Uses dynamic requires so it won't break compilation if the notification library isn't linked/installed.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const Device = require('expo-device');
    const Notifications = require('expo-notifications');

    // Configure foreground notification handling
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (!Device.isDevice) {
      console.log('[PushNotifications] Must use a physical device for Push Notifications');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PushNotifications] Push notifications permission was denied.');
      return null;
    }

    // Get Project ID for EAS builds from Expo Constants
    const Constants = require('expo-constants').default;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId
    })).data;
    
    console.log('[PushNotifications] Retured Expo Push Token:', token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  } catch (error) {
    console.log('[PushNotifications] Notifications library is not installed or fully loaded:', error);
    return null;
  }
}
