import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, FlatList, ActivityIndicator, TouchableOpacity, ScrollView 
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import PressSpring from '@/components/PressSpring';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AdminFeedbackScreen() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();
  
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFeedbacks(list);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const markAsRead = async (id: string, currentStatus: string) => {
    if (currentStatus === 'read') return;
    try {
      await updateDoc(doc(db, 'feedbacks', id), {
        status: 'read'
      });
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const renderFeedback = ({ item }: { item: any }) => {
    const isLowRating = item.rating <= 3;
    const isNew = item.status === 'new';
    const dateStr = new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
      <PressSpring 
        contentStyle={[
          styles.card, 
          { backgroundColor: colors.card, borderColor: isLowRating ? '#C46057' : colors.border },
          isLowRating && { borderWidth: 1 }
        ]}
        onPress={() => markAsRead(item.id, item.status)}
        scaleTo={0.97}
        hapticStyle="light"
        fullWidth={true}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.userName, { color: colors.text }]}>{item.userName}</Text>
            <Text style={[styles.userPhone, { color: colors.secondaryText }]}>{item.userId}</Text>
          </View>
          <View style={styles.ratingBadge}>
            <FontAwesome name="star" size={11} color="#B84600" style={{ marginRight: 6 }} />
            <Text style={[styles.ratingText, { color: isLowRating ? '#C46057' : colors.text }]}>{item.rating}/5</Text>
          </View>
        </View>

        <View style={styles.serviceRow}>
          <View style={styles.serviceTag}>
            <Text style={styles.serviceTagText}>{item.serviceName.toUpperCase()}</Text>
          </View>
          <Text style={[styles.dateText, { color: colors.secondaryText }]}>{dateStr}</Text>
        </View>

        {item.comments ? (
          <View style={[styles.commentsBox, { backgroundColor: isLowRating ? 'rgba(196, 96, 87, 0.08)' : colors.background }]}>
            <Text style={[styles.commentsText, { color: colors.text }]}>"{item.comments}"</Text>
          </View>
        ) : (
          <Text style={[styles.noCommentsText, { color: colors.secondaryText }]}>No comments provided.</Text>
        )}

        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </PressSpring>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Navigation Header */}
      <View style={styles.topNav}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
          <Link href={"/(admin)" as any} asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="users" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Members</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/bookings" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="calendar" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Bookings</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/payments" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="money" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Payments</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/pricing" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="tag" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Pricing</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/events" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="birthday-cake" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Events</Text>
              </View>
            </PressSpring>
          </Link>
          {!userProfile?.isSubAdmin && (
            <>
              <Link href="/(admin)/support" asChild>
                <PressSpring 
                  contentStyle={styles.navBtn}
                  scaleTo={0.96}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome name="comments" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                    <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Support</Text>
                  </View>
                </PressSpring>
              </Link>
              <PressSpring
                style={[styles.navBtn, styles.navBtnActive]}
                scaleTo={0.96}
                hapticStyle="selection"
                fullWidth={false}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <FontAwesome name="star" size={13} color="#B84600" style={{ marginRight: 6 }} />
                  <Text style={styles.navBtnTextActive}>Feedback</Text>
                </View>
              </PressSpring>
            </>
          )}
          <Link href="/(admin)/settings" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="cog" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Settings</Text>
              </View>
            </PressSpring>
          </Link>
        </ScrollView>
      </View>

      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerIconCircle}>
          <FontAwesome name="star" size={20} color="#B84600" />
        </View>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Client Feedback</Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]}>Monitor guest reviews and experience logs</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
      ) : feedbacks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <FontAwesome name="star-o" size={32} color={colors.tint} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Reviews Yet</Text>
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>When club members leave reviews, they will display here.</Text>
        </View>
      ) : (
        <FlatList
          data={feedbacks}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedback}
          contentContainerStyle={{ padding: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 20,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  userPhone: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E22',
    borderWidth: 1,
    borderColor: '#2A2520',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  serviceTag: {
    backgroundColor: '#1E1E22',
    borderWidth: 1,
    borderColor: '#2A2520',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  serviceTagText: {
    color: '#8C7B6B',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    letterSpacing: 1,
  },
  dateText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
  },
  commentsBox: {
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  commentsText: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  noCommentsText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontStyle: 'italic',
    marginTop: 4,
  },
  newBadge: {
    position: 'absolute',
    top: 14,
    right: 74,
    backgroundColor: '#6B9E76',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  newBadgeText: {
    color: '#0B0B0B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: TheOneTypography.bodyFamily,
  },
  topNav: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  navBtn: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  navBtnActive: {
    borderBottomColor: '#B84600',
  },
  navBtnText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  navBtnTextActive: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: '#B84600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
