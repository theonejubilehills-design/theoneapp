import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TheOneColors, TheOneTypography } from '@/constants/TheOneTheme';
import { FontAwesome } from '@expo/vector-icons';
import PressSpring from '@/components/PressSpring';

export default function StaffLayout() {
  const { userProfile, isLoading, logout } = useAuth();
  const router = useRouter();
  
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#B84600" />
      </View>
    );
  }

  if (!userProfile?.isStaff) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <FontAwesome name="lock" size={48} color="#B84600" style={{ marginBottom: 20 }} />
        <Text style={{ color: colors.text, fontSize: 22, fontFamily: TheOneTypography.headlineFamily, fontWeight: '600', marginBottom: 8 }}>Unauthorized Access</Text>
        <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily, textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
          This section is restricted to registered Staff accounts.
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
            justifyContent: 'center'
          }}
          scaleTo={0.94}
          hapticStyle="heavy"
          fullWidth={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FontAwesome name="sign-out" size={14} color="#0B0B0B" style={{ marginRight: 8 }} />
            <Text style={{ color: '#0B0B0B', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: TheOneTypography.bodyFamily }}>Log Out</Text>
          </View>
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
    <Stack
      screenOptions={{
        headerStyle,
        headerTitleStyle,
        headerTintColor: colors.tint,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Staff Schedule', 
          headerBackVisible: false,
          headerLeft: () => null,
          headerRight: () => (
            <PressSpring 
              onPress={async () => {
                await logout();
                router.replace('/login');
              }}
              contentStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
              scaleTo={0.88}
              hapticStyle="heavy"
              fullWidth={false}
            >
              <FontAwesome name="sign-out" size={18} color="#B84600" />
            </PressSpring>
          )
        }} 
      />
    </Stack>
  );
}
