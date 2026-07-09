import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Redirect } from 'expo-router';
import { TheOneColors, TheOneTypography } from '@/constants/TheOneTheme';
import { useAuth } from '../../context/AuthContext';

function TabIcon({ name, color, focused }: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  focused: boolean;
}) {
  return (
    <FontAwesome
      name={name}
      size={focused ? 20 : 18}
      color={color}
      style={{ marginBottom: -2 }}
    />
  );
}

export default function TabLayout() {
  const { userProfile } = useAuth();

  if (userProfile?.isStaff) {
    return <Redirect href="/(staff)" />;
  }

  if (userProfile?.isAdmin || userProfile?.isSubAdmin) {
    return <Redirect href="/(admin)" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TheOneColors.accent,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          backgroundColor: '#151518',
          borderWidth: 1,
          borderColor: TheOneColors.charcoalBorder,
          borderRadius: 24,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontFamily: TheOneTypography.bodyFamily,
          fontSize: 8,
          fontWeight: '700',
          textTransform: 'uppercase',
          marginTop: -2,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: 'My Bookings',
          tabBarIcon: ({ color, focused }) => <TabIcon name="list-ul" color={color} focused={focused} />,
          href: userProfile?.isAdmin ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Concierge',
          tabBarIcon: ({ color, focused }) => <TabIcon name="comments" color={color} focused={focused} />,
          href: userProfile?.isAdmin ? null : undefined,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Member',
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
          href: userProfile?.isAdmin ? null : undefined,
        }}
      />
    </Tabs>
  );
}
