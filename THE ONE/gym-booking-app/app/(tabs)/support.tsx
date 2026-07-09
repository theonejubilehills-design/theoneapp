import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, TextInput, TouchableOpacity, 
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Keyboard
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { collection, doc, query, orderBy, onSnapshot, setDoc, addDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import PressSpring from '@/components/PressSpring';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function SupportChatScreen() {
  const router = useRouter();
  const { prefilled } = useLocalSearchParams();

  useEffect(() => {
    if (prefilled) {
      setInputText(prefilled as string);
    }
  }, [prefilled]);
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!userProfile?.phoneNumber) return;

    // Create chat doc if not exists
    const initializeChat = async () => {
      const chatRef = doc(db, 'support_chats', userProfile.phoneNumber);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          userId: userProfile.phoneNumber,
          userName: userProfile.name || 'User',
          lastMessage: '',
          lastMessageTime: new Date().toISOString(),
          unreadAdminCount: 0,
          unreadUserCount: 0
        });
      }
    };
    initializeChat();

    // Listen to messages
    const q = query(
      collection(db, 'support_chats', userProfile.phoneNumber, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      setIsLoading(false);
      
      // Reset user unread count
      if (msgs.length > 0) {
        updateDoc(doc(db, 'support_chats', userProfile.phoneNumber), {
          unreadUserCount: 0
        }).catch(console.error);
      }
      
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return () => unsubscribe();
  }, [userProfile?.phoneNumber]);

  const handleSend = async () => {
    if (!inputText.trim() || !userProfile?.phoneNumber) return;

    const text = inputText.trim();
    setInputText('');
    Keyboard.dismiss();

    const timestamp = new Date().toISOString();
    
    // Add user message
    await addDoc(collection(db, 'support_chats', userProfile.phoneNumber, 'messages'), {
      text,
      sender: 'user',
      timestamp
    });

    // Update chat doc
    const chatRef = doc(db, 'support_chats', userProfile.phoneNumber);
    const chatSnap = await getDoc(chatRef);
    let currentAdminUnread = 0;
    if (chatSnap.exists()) {
      currentAdminUnread = chatSnap.data().unreadAdminCount || 0;
    }

    await updateDoc(chatRef, {
      lastMessage: text,
      lastMessageTime: timestamp,
      unreadAdminCount: currentAdminUnread + 1,
      userName: userProfile.name || 'User' // ensure name is up to date
    });

    // Check Auto-Bot working hours
    const currentHour = new Date().getHours();
    // 9:00 PM (21:00) to 6:00 AM (05:59)
    if (currentHour >= 21 || currentHour < 6) {
      setTimeout(async () => {
        const botResponse = "Thank you for reaching out! We received your inquiry outside of our working hours (6:00 AM - 9:00 PM). Our team will get back to you as soon as business hours resume.";
        const botTimestamp = new Date().toISOString();
        
        await addDoc(collection(db, 'support_chats', userProfile.phoneNumber, 'messages'), {
          text: botResponse,
          sender: 'bot',
          timestamp: botTimestamp
        });

        await updateDoc(chatRef, {
          lastMessage: botResponse,
          lastMessageTime: botTimestamp,
          unreadUserCount: 1
        });
      }, 1000); // 1 sec delay for realistic bot feel
    }
  };

  const renderMessage = (msg: any) => {
    const isUser = msg.sender === 'user';
    const isBot = msg.sender === 'bot';
    
    return (
      <View key={msg.id} style={{ marginBottom: 12, flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
        {!isUser && (
          <View style={styles.botAvatarContainer}>
            <FontAwesome name={isBot ? "android" : "user-circle"} size={14} color="#FFF" />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : (isBot ? styles.botBubble : styles.adminBubble)
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userText : styles.adminText
          ]}>
            {msg.text}
          </Text>
          <Text style={[
            styles.timeText,
            isUser ? styles.userTime : styles.adminTime
          ]}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <PressSpring
            onPress={() => router.back()}
            style={{ paddingRight: 14, justifyContent: 'center', alignItems: 'center' }}
            scaleTo={0.88}
            hapticStyle="light"
            fullWidth={false}
          >
            <FontAwesome name="arrow-left" size={16} color={colors.text} />
          </PressSpring>

          <View style={styles.headerAvatar}>
            <FontAwesome name="support" size={20} color={TheOneColors.textInverse} />
            <View style={styles.onlineIndicator} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text, fontFamily: TheOneTypography.headlineFamily }]}>CONCIERGE</Text>
            <Text style={[styles.headerSubtitle, { color: colors.secondaryText, fontFamily: TheOneTypography.bodyFamily }]}>THE ONE Elite Member Support</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
          ) : messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome name="comments" size={40} color={colors.tint} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>How can we help?</Text>
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Send a message to start a conversation with our support team.</Text>
              
              <View style={styles.quickRepliesContainer}>
                {['Working hours?', 'Membership upgrade?', 'Cancel booking?'].map((qr, idx) => (
                  <PressSpring 
                    key={idx} 
                    contentStyle={[styles.quickReplyChip, { borderColor: colors.border }]} 
                    onPress={() => setInputText(qr)}
                    scaleTo={0.92}
                    hapticStyle="selection"
                    fullWidth={false}
                  >
                    <Text style={[styles.quickReplyText, { color: colors.tint }]}>{qr}</Text>
                  </PressSpring>
                ))}
              </View>
            </View>
          ) : (
            messages.map(renderMessage)
          )}
        </ScrollView>

        <View style={[styles.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
            placeholder="Type your message..."
            placeholderTextColor={colors.secondaryText}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <PressSpring 
            contentStyle={[styles.sendButton, { backgroundColor: inputText.trim() ? colors.tint : colors.border }]} 
            onPress={handleSend}
            disabled={!inputText.trim()}
            scaleTo={0.88}
            hapticStyle="medium"
            fullWidth={false}
          >
            <FontAwesome name="paper-plane" size={16} color={TheOneColors.textInverse} />
          </PressSpring>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 20,
    backgroundColor: TheOneColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TheOneColors.success,
    borderWidth: 2,
    borderColor: TheOneColors.black,
  },
  headerTitle: {
    fontSize: 20,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(184, 70, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 22,
    marginBottom: 32,
  },
  quickRepliesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  quickReplyChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(184, 70, 0, 0.04)',
  },
  quickReplyText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
  },
  botAvatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TheOneColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: TheOneColors.accent,
  },
  adminBubble: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
  },
  botBubble: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: TheOneColors.textInverse,
    fontFamily: TheOneTypography.bodyFamily,
  },
  adminText: {
    color: TheOneColors.textPrimary,
    fontFamily: TheOneTypography.bodyFamily,
  },
  timeText: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
    fontWeight: '500',
  },
  userTime: {
    color: 'rgba(11,11,11,0.5)',
  },
  adminTime: {
    color: '#9CA3AF',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});
