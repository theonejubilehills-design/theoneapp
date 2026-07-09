import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, 
  Modal, TextInput, KeyboardAvoidingView, Platform, 
  ScrollView, ActivityIndicator, Keyboard, Pressable
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import PressSpring from '@/components/PressSpring';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AdminSupportScreen() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  const [chats, setChats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  let messagesUnsubscribe: any = null;

  // Fetch all chats
  useEffect(() => {
    const q = query(collection(db, 'support_chats'), orderBy('lastMessageTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChats(chatList);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openChat = (chat: any) => {
    setActiveChat(chat);
    setIsChatLoading(true);

    const q = query(
      collection(db, 'support_chats', chat.id, 'messages'),
      orderBy('timestamp', 'asc')
    );

    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      setIsChatLoading(false);
      
      // Clear admin unread count
      updateDoc(doc(db, 'support_chats', chat.id), {
        unreadAdminCount: 0
      }).catch(console.error);

      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });
  };

  const closeChat = () => {
    if (messagesUnsubscribe) {
      messagesUnsubscribe();
    }
    setActiveChat(null);
    setMessages([]);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !activeChat) return;

    const text = inputText.trim();
    setInputText('');
    Keyboard.dismiss();

    const timestamp = new Date().toISOString();
    
    // Add admin message
    await addDoc(collection(db, 'support_chats', activeChat.id, 'messages'), {
      text,
      sender: 'admin',
      timestamp
    });

    // Update chat doc
    const chatRef = doc(db, 'support_chats', activeChat.id);
    const chatSnap = await getDoc(chatRef);
    let currentUserUnread = 0;
    if (chatSnap.exists()) {
      currentUserUnread = chatSnap.data().unreadUserCount || 0;
    }

    await updateDoc(chatRef, {
      lastMessage: text,
      lastMessageTime: timestamp,
      unreadUserCount: currentUserUnread + 1
    });
  };

  const renderMessage = (msg: any) => {
    const isAdmin = msg.sender === 'admin';
    const isBot = msg.sender === 'bot';
    const isUser = msg.sender === 'user';
    
    return (
      <View key={msg.id} style={{ marginBottom: 14, flexDirection: isAdmin ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
        {isBot && (
          <View style={styles.botAvatarContainer}>
            <FontAwesome name="android" size={12} color="#0B0B0B" />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isAdmin ? styles.adminBubble : (isBot ? styles.botBubble : styles.userBubble)
        ]}>
          {isBot && (
            <Text style={styles.botLabel}>AUTO-REPLY</Text>
          )}
          {isAdmin && (
            <Text style={styles.adminLabel}>YOU · ADMIN</Text>
          )}
          <Text style={[
            styles.messageText,
            isAdmin ? styles.adminText : styles.userText
          ]}>
            {msg.text}
          </Text>
          <Text style={[
            styles.timeText,
            isAdmin ? styles.adminTime : styles.userTime
          ]}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const formatPhone = (id: string) => {
    // Show last 10 digits formatted as •••• ••• XXXX
    const digits = id.replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
      return `•••• ••• ${digits.slice(-4)}`;
    }
    return id;
  };

  const renderChatItem = ({ item }: { item: any }) => {
    const date = new Date(item.lastMessageTime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = isToday
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const hasUnread = item.unreadAdminCount > 0;

    return (
      <PressSpring 
        style={[styles.chatCard, hasUnread && styles.chatCardUnread]} 
        onPress={() => openChat(item)}
        scaleTo={0.98}
        hapticStyle="light"
        fullWidth={true}
      >
        {/* Avatar */}
        <View style={styles.chatAvatar}>
          <Text style={styles.chatAvatarText}>
            {(item.userName || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.chatCardHeader}>
            <View>
              <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]}>
                {item.userName || 'Unknown Member'}
              </Text>
              <Text style={styles.chatPhone}>{formatPhone(item.userId || item.id)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.chatTime, hasUnread && { color: TheOneColors.accent }]}>
                {timeStr}
              </Text>
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unreadAdminCount}</Text>
                </View>
              )}
            </View>
          </View>
          <Text 
            style={[styles.chatLastMsg, hasUnread && styles.chatLastMsgUnread]}
            numberOfLines={1}
          >
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>
      </PressSpring>
    );
  };

  const filteredChats = chats.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.userName || '').toLowerCase().includes(q) || (c.userId || '').includes(q);
  });

  return (
    <View style={styles.container}>
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
              <PressSpring
                style={[styles.navBtn, styles.navBtnActive]}
                scaleTo={0.96}
                hapticStyle="selection"
                fullWidth={false}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <FontAwesome name="comments" size={13} color="#B84600" style={{ marginRight: 6 }} />
                  <Text style={styles.navBtnTextActive}>Support</Text>
                </View>
              </PressSpring>
              <Link href="/(admin)/feedback" asChild>
                <PressSpring 
                  contentStyle={styles.navBtn}
                  scaleTo={0.96}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome name="star" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                    <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Feedback</Text>
                  </View>
                </PressSpring>
              </Link>
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <FontAwesome name="search" size={13} color={TheOneColors.textTertiary} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            placeholderTextColor={TheOneColors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})}
          />
          {searchQuery.length > 0 && (
            <PressSpring 
              onPress={() => setSearchQuery('')} 
              style={{ padding: 4 }}
              scaleTo={0.85}
              hapticStyle="selection"
              fullWidth={false}
            >
              <FontAwesome name="times-circle" size={13} color={TheOneColors.textTertiary} />
            </PressSpring>
          )}
        </View>
        <Text style={styles.resultCount}>
          {filteredChats.length} {filteredChats.length === 1 ? 'conversation' : 'conversations'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={TheOneColors.accent} style={{ marginTop: 60 }} />
      ) : filteredChats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <FontAwesome name="comments-o" size={26} color={TheOneColors.accent} />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No Results Found' : 'No Open Inquiries'}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? `No conversations match "${searchQuery}".`
              : 'All member inquiries have been resolved.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={renderChatItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        />
      )}

      {/* Chat Modal */}
      <Modal
        visible={!!activeChat}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeChat}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <PressSpring 
              onPress={closeChat} 
              contentStyle={styles.closeBtn}
              scaleTo={0.88}
              hapticStyle="light"
              fullWidth={false}
            >
              <FontAwesome name="chevron-down" size={16} color={TheOneColors.textSecondary} />
            </PressSpring>
            <View style={styles.modalHeaderCenter}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {activeChat?.userName || 'Member'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {formatPhone(activeChat?.userId || activeChat?.id || '')}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView 
              ref={scrollViewRef}
              style={styles.chatArea}
              contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {isChatLoading ? (
                <ActivityIndicator size="large" color={TheOneColors.accent} style={{ marginTop: 40 }} />
              ) : messages.length === 0 ? (
                <View style={styles.chatEmptyState}>
                  <FontAwesome name="comments-o" size={32} color={TheOneColors.textTertiary} />
                  <Text style={styles.chatEmptyText}>No messages yet in this conversation.</Text>
                </View>
              ) : (
                messages.map(renderMessage)
              )}
            </ScrollView>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Type your reply..."
                placeholderTextColor={TheOneColors.textTertiary}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})}
              />
              <PressSpring 
                style={!inputText.trim() && { opacity: 0.5 }}
                contentStyle={StyleSheet.flatten([styles.sendButton, !inputText.trim() && styles.sendButtonDisabled])} 
                onPress={handleSend}
                disabled={!inputText.trim()}
                scaleTo={0.92}
                hapticStyle="medium"
                fullWidth={false}
              >
                <FontAwesome name="paper-plane" size={14} color={inputText.trim() ? '#FFFFFF' : TheOneColors.textTertiary} />
              </PressSpring>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TheOneColors.black,
  },

  // ── Search ──────────────────────────────────
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textPrimary,
    letterSpacing: 0.1,
  },
  resultCount: {
    marginTop: 8,
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Empty State ─────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    color: TheOneColors.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Chat Cards ──────────────────────────────
  chatCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
    gap: 14,
  },
  chatCardUnread: {
    borderBottomColor: 'rgba(184, 70, 0, 0.25)',
  },
  chatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1.5,
    borderColor: TheOneColors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatAvatarText: {
    fontSize: 16,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: TheOneColors.accent,
    letterSpacing: 0.5,
  },
  chatCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    color: TheOneColors.textPrimary,
    letterSpacing: 0.2,
  },
  chatNameUnread: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chatPhone: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textTertiary,
    letterSpacing: 1,
    marginTop: 2,
  },
  chatTime: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textTertiary,
    letterSpacing: 0.3,
  },
  chatLastMsg: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textSecondary,
    lineHeight: 18,
  },
  chatLastMsgUnread: {
    color: TheOneColors.textPrimary,
    fontWeight: '500',
  },
  unreadBadge: {
    marginTop: 6,
    width: 20,
    height: 20,
    backgroundColor: TheOneColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
  },

  // ── Modal ───────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: TheOneColors.black,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderCenter: {
    alignItems: 'center',
    flex: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: TheOneColors.textPrimary,
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textTertiary,
    letterSpacing: 1.5,
    marginTop: 2,
  },

  // ── Chat Messages ───────────────────────────
  chatArea: {
    flex: 1,
  },
  chatEmptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 12,
  },
  chatEmptyText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textTertiary,
    textAlign: 'center',
  },
  botAvatarContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: TheOneColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  userBubble: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
  },
  botBubble: {
    backgroundColor: 'rgba(107, 158, 118, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(107, 158, 118, 0.2)',
  },
  adminBubble: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    borderLeftWidth: 2,
    borderLeftColor: TheOneColors.accent,
  },
  botLabel: {
    fontSize: 9,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.success,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  adminLabel: {
    fontSize: 9,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.accent,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  userText: {
    color: TheOneColors.textPrimary,
  },
  adminText: {
    color: TheOneColors.textPrimary,
  },
  timeText: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  userTime: {
    color: TheOneColors.textTertiary,
  },
  adminTime: {
    color: TheOneColors.textTertiary,
  },

  // ── Input Bar ───────────────────────────────
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    borderTopWidth: 1,
    borderTopColor: TheOneColors.charcoalBorder,
    backgroundColor: TheOneColors.charcoal,
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    backgroundColor: TheOneColors.black,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textPrimary,
    letterSpacing: 0.1,
  },
  sendButton: {
    width: 42,
    height: 42,
    backgroundColor: TheOneColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
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
