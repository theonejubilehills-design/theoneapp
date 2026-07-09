import { useState, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { TheOneColors, TheOneTypography, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { FontAwesome } from '@expo/vector-icons';
import PressSpring from '@/components/PressSpring';
import { db } from '../../firebaseConfig';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { playClickSound } from '../../utils/SoundManager';

export default function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!user?.phoneNumber) return;
    const qNotifs = query(
      collection(db, 'in_app_notifications'),
      where('userId', '==', user.phoneNumber)
    );
    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(list);
    });
    return () => unsubscribeNotifs();
  }, [user?.phoneNumber]);

  const handleReadNotification = async (notif: any) => {
    try {
      await updateDoc(doc(db, 'in_app_notifications', notif.id), { read: true });
    } catch (e) {
      console.warn('Failed to mark read:', e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderHeaderRight = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <PressSpring 
        onPress={() => { playClickSound(); setShowNotifications(true); }}
        style={{ paddingHorizontal: 10, paddingVertical: 5, marginRight: 12, position: 'relative' }}
        scaleTo={0.88}
        hapticStyle="light"
        fullWidth={false}
      >
        <FontAwesome name="bell-o" size={18} color={colors.text} />
        {unreadCount > 0 && (
          <View style={{ position: 'absolute', top: 0, right: 4, backgroundColor: '#B84600', borderRadius: 8, minWidth: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#0B0B0B', fontSize: 7, fontWeight: '800' }}>{unreadCount}</Text>
          </View>
        )}
      </PressSpring>
      <PressSpring 
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
        style={{ paddingHorizontal: 10, paddingVertical: 5 }}
        scaleTo={0.88}
        hapticStyle="light"
        fullWidth={false}
      >
        <FontAwesome name="sign-out" size={18} color="#B84600" />
      </PressSpring>
    </View>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#B84600" />
      </View>
    );
  }

  if (!user?.isAdmin && !user?.isSubAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <FontAwesome name="exclamation-triangle" size={48} color="#B84600" style={{ marginBottom: 20 }} />
        <Text style={{ color: colors.text, fontSize: 22, fontFamily: TheOneTypography.headlineFamily, fontWeight: '600', marginBottom: 8 }}>Unauthorized Access</Text>
        <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily, textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
          This terminal is restricted to administrative clearance only.
        </Text>
        <PressSpring 
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          contentStyle={{ 
            backgroundColor: '#B84600', 
            paddingVertical: 14, 
            paddingHorizontal: 28, 
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
          }}
          scaleTo={0.94}
          hapticStyle="heavy"
          fullWidth={false}
        >
          <FontAwesome name="sign-out" size={14} color="#0B0B0B" style={{ marginRight: 8 }} />
          <Text style={{ color: '#0B0B0B', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: TheOneTypography.bodyFamily }}>Log Out & Reset</Text>
        </PressSpring>
      </View>
    );
  }

  const headerStyle = {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: 'transparent',
    elevation: 0,
  };

  const headerTitleStyle = {
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600' as const,
    fontSize: 18,
    color: colors.text,
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle,
          headerTitleStyle,
          headerTintColor: colors.tint,
          headerShadowVisible: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'Members', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="bookings" 
          options={{ 
            title: 'Bookings', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="payments" 
          options={{ 
            title: 'Payments', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="settings" 
          options={{ 
            title: 'Settings', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="support" 
          options={{ 
            title: 'Concierge', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="feedback" 
          options={{ 
            title: 'Reviews', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="pricing" 
          options={{ 
            title: 'Pricing', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
        <Stack.Screen 
          name="events" 
          options={{ 
            title: 'Events', 
            headerBackVisible: false,
            headerLeft: () => null,
            headerRight: renderHeaderRight
          }} 
        />
      </Stack>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontFamily: TheOneTypography.headlineFamily, color: colors.text }}>Admin Notifications</Text>
            <PressSpring onPress={() => { playClickSound(); setShowNotifications(false); }} scaleTo={0.88} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="times" size={20} color={colors.secondaryText} />
            </PressSpring>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
            {notifications.length === 0 ? (
              <Text style={{ color: colors.secondaryText, marginTop: 40, textAlign: 'center', fontFamily: TheOneTypography.bodyFamily }}>No admin notifications.</Text>
            ) : (
              notifications.map(notif => (
                <PressSpring 
                  key={notif.id} 
                  contentStyle={{
                    backgroundColor: notif.read ? 'transparent' : 'rgba(184, 70, 0, 0.08)',
                    padding: 16, 
                    borderRadius: 12, 
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: notif.read ? colors.border : TheOneColors.accentBorder
                  }}
                  onPress={() => { playClickSound(); handleReadNotification(notif); }}
                  scaleTo={0.97}
                  hapticStyle="light"
                  fullWidth={true}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: TheOneTypography.bodyFamily, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{notif.title}</Text>
                    <Text style={{ fontSize: 13, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText, lineHeight: 18 }}>{notif.body}</Text>
                    <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText, marginTop: 8 }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </PressSpring>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
