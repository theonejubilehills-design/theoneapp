import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0B0B', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#B84600" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (user.isAdmin || user.isSubAdmin) {
    return <Redirect href="/(admin)" />;
  }

  if (user.isStaff) {
    return <Redirect href="/(staff)" />;
  }

  return <Redirect href="/(tabs)" />;
}
