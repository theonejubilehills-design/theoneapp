import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity,
  FlatList, ScrollView, ActivityIndicator, Pressable, Modal, Platform, LayoutAnimation
} from 'react-native';
import { db } from '../../firebaseConfig';
import {
  collection, doc, updateDoc, addDoc, onSnapshot,
  query, where, getDocs, deleteDoc
} from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { useRouter, Link } from 'expo-router';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';
import { useAuth } from '../../context/AuthContext';
import PressSpring from '@/components/PressSpring';
import { playSlideSound } from '../../utils/SoundManager';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';

interface Due {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  serviceName: string;
  date: string;
  status: 'pending' | 'paid';
  paidAt?: string;
  paymentMethod?: string;
  createdAt: string;
}

export default function AdminPayments() {
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [dues, setDues] = useState<Due[]>([]);
  const [filter, setFilter] = useState<'pending' | 'paid'>('pending');

  // Success Popup Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [] as AlertButton[] | undefined
  });
  const showAlert = (title: string, message: string, buttons?: AlertButton[]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };
  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const [invoicePreviewHtml, setInvoicePreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubDues = onSnapshot(collection(db, 'dues'), (snap) => {
      const dbList: Due[] = [];
      snap.forEach((doc) => {
        dbList.push({ id: doc.id, ...doc.data() } as Due);
      });
      dbList.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
      setDues(dbList);
      setLoading(false);
    }, (err) => {
      console.error('Dues sub failed:', err);
      setLoading(false);
    });

    return () => unsubDues();
  }, []);

  const handleMarkAsPaid = async (due: Due) => {
    const performMarkPaid = async (method: 'Cash' | 'UPI' | 'Cash (GST)' | 'UPI (GST)') => {
      try {
        const dueDocRef = doc(db, 'dues', due.id);
        await updateDoc(dueDocRef, {
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentMethod: `Admin Cleared - ${method}`
        });

        const paymentData = {
          userId: due.userId,
          userName: due.userName,
          dueId: due.id,
          amount: due.amount,
          serviceName: due.serviceName,
          date: new Date().toISOString().split('T')[0],
          paymentMethod: `Admin Cleared - ${method}`,
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'payments'), paymentData);

        setSuccessModalMessage(`Cleared due of ₹${due.amount} for ${due.userName} (${due.serviceName}) via ${method}`);
        setShowSuccessModal(true);
      } catch (e: any) {
        console.error('Settle payment failed:', e);
        showAlert('Error', e.message || String(e));
      }
    };

    showAlert(
      'Confirm Payment Method',
      `How was the due of ₹${due.amount} for ${due.userName} settled?`,
      [
        { text: 'Cash', style: 'default', onPress: () => performMarkPaid('Cash') },
        { text: 'UPI', style: 'default', onPress: () => performMarkPaid('UPI') },
        { text: 'Cash (GST)', style: 'default', onPress: () => performMarkPaid('Cash (GST)') },
        { text: 'UPI (GST)', style: 'default', onPress: () => performMarkPaid('UPI (GST)') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const generateInvoice = async (due: Due) => {
    try {
      const isGST = due.paymentMethod?.includes('GST');
      const methodStr = due.paymentMethod?.replace('Admin Cleared - ', '') || 'Payment';
      
      let invoiceTitle = 'Invoice';
      if (isGST) invoiceTitle = 'Tax Invoice';
      else if (methodStr.includes('Cash')) invoiceTitle = 'Cash Receipt';
      else if (methodStr.includes('UPI')) invoiceTitle = 'UPI Receipt';

      let amountRowsHtml = '';
      let totalsHtml = '';
      if (isGST) {
        amountRowsHtml = `
          <tr>
            <td>${due.serviceName}</td>
            <td class="center">1</td>
            <td class="right">₹${(due.amount * 0.82).toFixed(2)}</td>
            <td class="right">₹${(due.amount * 0.82).toFixed(2)}</td>
          </tr>
        `;
        totalsHtml = `
          <div class="summary-row">
            <span>Subtotal</span>
            <span>₹${(due.amount * 0.82).toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span>Tax (18%)</span>
            <span>₹${(due.amount * 0.18).toFixed(2)}</span>
          </div>
          <div class="total-block">
            <span>Total</span>
            <span>₹${due.amount.toFixed(2)}</span>
          </div>
        `;
      } else {
        amountRowsHtml = `
          <tr>
            <td>${due.serviceName}</td>
            <td class="center">1</td>
            <td class="right">₹${due.amount.toFixed(2)}</td>
            <td class="right">₹${due.amount.toFixed(2)}</td>
          </tr>
        `;
        totalsHtml = `
          <div class="summary-row">
            <span>Subtotal</span>
            <span>₹${due.amount.toFixed(2)}</span>
          </div>
          <div class="total-block">
            <span>Total</span>
            <span>₹${due.amount.toFixed(2)}</span>
          </div>
        `;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
              @page { margin: 0; }
              body {
                font-family: 'Inter', Helvetica, sans-serif;
                background-color: #0B0B0B;
                color: #F5F0EB;
                margin: 0;
                padding: 60px 80px;
                -webkit-font-smoothing: antialiased;
                box-sizing: border-box;
              }
              
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 60px;
              }
              .logo-box {
                border: 1px solid #B84600;
                color: #B84600;
                padding: 12px 18px;
                font-family: 'Cormorant Garamond', serif;
                font-size: 20px;
                font-weight: 700;
                text-align: center;
                letter-spacing: 2px;
                line-height: 1.1;
              }
              .logo-box span { font-size: 10px; font-weight: 400; display: block; letter-spacing: 4px; color: #F5F0EB; margin-top: 4px;}
              .title {
                font-family: 'Cormorant Garamond', serif;
                font-size: 40px;
                font-weight: 400;
                color: #B84600;
                letter-spacing: 1px;
                text-transform: uppercase;
              }

              .meta {
                display: flex;
                justify-content: space-between;
                margin-bottom: 50px;
                font-size: 13px;
                line-height: 1.6;
              }
              .meta-left strong { font-size: 14px; margin-bottom: 8px; display: block; font-weight: 600; color: #8C7B6B; text-transform: uppercase; letter-spacing: 1px; }
              .meta-right { text-align: right; color: #8C7B6B; }

              .table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
              }
              .table th {
                text-align: left;
                font-size: 12px;
                font-weight: 600;
                border-bottom: 1px solid #B84600;
                padding-bottom: 12px;
                color: #B84600;
                text-transform: uppercase;
                letter-spacing: 1.5px;
              }
              .table td {
                padding: 20px 0;
                font-size: 14px;
                border-bottom: 1px solid rgba(245, 240, 235, 0.06);
                color: #F5F0EB;
              }
              .table th.right, .table td.right { text-align: right; }
              .table th.center, .table td.center { text-align: center; }

              .summary {
                display: flex;
                justify-content: flex-end;
                margin-bottom: 60px;
              }
              .summary-box {
                width: 300px;
              }
              .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                font-size: 13px;
                font-weight: 600;
                color: #8C7B6B;
              }
              .total-block {
                background-color: #151515;
                border: 1px solid #B84600;
                color: #B84600;
                display: flex;
                justify-content: space-between;
                padding: 15px 20px;
                font-size: 18px;
                font-weight: 700;
                margin-top: 10px;
              }

              .footer {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                margin-top: 40px;
              }
              .thank-you {
                font-family: 'Cormorant Garamond', serif;
                font-size: 32px;
                font-style: italic;
                margin-bottom: 20px;
                color: #B84600;
              }
              .payment-info {
                font-size: 12px;
                line-height: 1.6;
                color: #8C7B6B;
                margin-top: 20px;
              }
              .payment-info strong { display: block; font-size: 13px; margin-bottom: 5px; color: #F5F0EB; text-transform: uppercase; letter-spacing: 1px; }
              
              .signature-block {
                text-align: right;
              }
              .signature-name {
                font-family: 'Cormorant Garamond', serif;
                font-size: 24px;
                margin-bottom: 6px;
                color: #F5F0EB;
                letter-spacing: 0.5px;
              }
              .address {
                font-size: 12px;
                color: #8C7B6B;
                line-height: 1.5;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo-box">
                THE ONE<span>WELLNESS</span>
              </div>
              <div class="title">${invoiceTitle}</div>
            </div>
            
            <div class="meta">
              <div class="meta-left">
                <strong>Billed to:</strong>
                ${due.userName}<br>
                Club Member
              </div>
              <div class="meta-right">
                Invoice ID: ${due.id.slice(0,6).toUpperCase()}<br>
                Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            
            <table class="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="center">Quantity</th>
                  <th class="right">Rate</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${amountRowsHtml}
              </tbody>
            </table>
            
            <div class="summary">
              <div class="summary-box">
                ${totalsHtml}
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-left">
                <div class="thank-you">Thank You.</div>
                <div class="payment-info">
                  <strong>Payment Information</strong>
                  Method: ${methodStr}<br>
                  Status: Paid<br>
                  Settle Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div class="signature-block">
                <div class="signature-name">THE ONE</div>
                <div class="address">
                  Private Wellness Club<br>
                  concierge@theoneclub.com
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      setInvoicePreviewHtml(htmlContent);
      
    } catch (error: any) {
      console.error('Invoice generation failed:', error);
      showAlert('Error', 'Failed to generate invoice.');
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoicePreviewHtml) return;
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html: invoicePreviewHtml });
      } else {
        const { uri } = await Print.printToFileAsync({ html: invoicePreviewHtml });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } else {
          showAlert('Saved', 'Invoice generated at: ' + uri);
        }
      }
    } catch (error: any) {
      console.error('Save invoice failed:', error);
      showAlert('Error', 'Failed to save invoice.');
    }
  };

  const handleClearCollectedDue = async (due: Due) => {
    if (userProfile?.isSubAdmin) {
      showAlert('Unauthorized', 'Only administrators can clear payment history.');
      return;
    }
    const performClearCollected = async () => {
      try {
        await deleteDoc(doc(db, 'dues', due.id));

        const paymentsQuery = query(
          collection(db, 'payments'),
          where('dueId', '==', due.id)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        const deletePromises = paymentsSnap.docs.map(d => deleteDoc(doc(db, 'payments', d.id)));
        await Promise.all(deletePromises);

        setSuccessModalMessage(`Cleared payment history for ${due.userName} (₹${due.amount})`);
        setShowSuccessModal(true);
      } catch (e: any) {
        console.error('Clear collected due failed:', e);
        showAlert('Error', 'Failed to clear payment record.');
      }
    };

    showAlert(
      'Confirm Clear Payment',
      `Clear collected payment of ₹${due.amount} for ${due.userName}? This removes the history record.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear History', style: 'destructive', onPress: performClearCollected }
      ]
    );
  };

  const handleClearAllCollected = async () => {
    if (userProfile?.isSubAdmin) {
      showAlert('Unauthorized', 'Only administrators can clear payment history.');
      return;
    }
    const performClearAllCollected = async (method?: 'Cash' | 'UPI') => {
      try {
        let duesToClear = dues.filter(d => d.status === 'paid');
        if (method) {
          duesToClear = duesToClear.filter(d => d.paymentMethod?.includes(method));
        }

        if (duesToClear.length === 0) {
          showAlert('No Data', `There are no ${method ? method + ' ' : ''}payments to clear.`);
          return;
        }

        const deleteDuePromises = duesToClear.map(d => deleteDoc(doc(db, 'dues', d.id)));
        const deletePaymentPromises = duesToClear.map(async (due) => {
          const paymentsQuery = query(
            collection(db, 'payments'),
            where('dueId', '==', due.id)
          );
          const paymentsSnap = await getDocs(paymentsQuery);
          const deletePromises = paymentsSnap.docs.map(d => deleteDoc(doc(db, 'payments', d.id)));
          await Promise.all(deletePromises);
        });

        await Promise.all([...deleteDuePromises, ...deletePaymentPromises]);

        setSuccessModalMessage(`Cleared ${method ? method + ' ' : ''}payment history (${duesToClear.length} records)`);
        setShowSuccessModal(true);
      } catch (e: any) {
        console.error('Clear collected dues failed:', e);
        showAlert('Error', 'Failed to clear payment records.');
      }
    };

    showAlert(
      'Clear Payment History',
      'Select payment types to clear from the history archives:',
      [
        { text: 'Clear Cash Only', style: 'default', onPress: () => performClearAllCollected('Cash') },
        { text: 'Clear UPI Only', style: 'default', onPress: () => performClearAllCollected('UPI') },
        { text: 'Clear All', style: 'destructive', onPress: () => performClearAllCollected() },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const filteredDues = dues.filter(d => d.status === filter);

  // Stats calculation
  const totalPendingAmount = dues
    .filter(d => d.status === 'pending')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalPaidAmount = dues
    .filter(d => d.status === 'paid')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const pendingCount = dues.filter(d => d.status === 'pending').length;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />

      {/* Invoice Preview Modal */}
      <Modal visible={!!invoicePreviewHtml} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#0B0B0B' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#151515', borderBottomWidth: 1, borderBottomColor: '#2A2520' }}>
            <PressSpring onPress={() => setInvoicePreviewHtml(null)} contentStyle={{ padding: 10 }} scaleTo={0.88} hapticStyle="selection" fullWidth={false}>
              <Text style={{ color: '#B84600', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontFamily: TheOneTypography.bodyFamily }}>Close</Text>
            </PressSpring>
            <Text style={{ color: '#F5F0EB', fontSize: 16, fontFamily: TheOneTypography.headlineFamily, fontWeight: '600' }}>Invoice Preview</Text>
            <PressSpring onPress={handleSaveInvoice} contentStyle={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#B84600', borderRadius: 12 }} scaleTo={0.94} hapticStyle="medium" fullWidth={false}>
              <Text style={{ color: '#0B0B0B', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontFamily: TheOneTypography.bodyFamily }}>Save PDF</Text>
            </PressSpring>
          </View>
          {invoicePreviewHtml && (
            Platform.OS === 'web' ? (
              <iframe srcDoc={invoicePreviewHtml} style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#0B0B0B' }} />
            ) : (
              <WebView source={{ html: invoicePreviewHtml }} style={{ flex: 1, backgroundColor: '#0B0B0B' }} />
            )
          )}
        </View>
      </Modal>

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
          <PressSpring
            style={[styles.navBtn, styles.navBtnActive]}
            scaleTo={0.96}
            hapticStyle="selection"
            fullWidth={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="money" size={13} color="#B84600" style={{ marginRight: 6 }} />
              <Text style={styles.navBtnTextActive}>Payments</Text>
            </View>
          </PressSpring>
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

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>Outstanding Dues</Text>
          <Text style={[styles.summaryValue, { color: '#C46057', fontFamily: TheOneTypography.numberFamily }]}>₹{totalPendingAmount}</Text>
          <Text style={[styles.summarySub, { color: colors.secondaryText }]}>{pendingCount} pending charges</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.secondaryText }]}>Collected Dues</Text>
          <Text style={[styles.summaryValue, { color: '#6B9E76', fontFamily: TheOneTypography.numberFamily }]}>₹{totalPaidAmount}</Text>
          <Text style={[styles.summarySub, { color: colors.secondaryText }]}>Settled payments history</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.segmentedRow, { backgroundColor: 'transparent', borderColor: colors.border }]}>
        <PressSpring
          contentStyle={[styles.segmentBtn, filter === 'pending' ? { backgroundColor: '#B84600' } : { backgroundColor: 'transparent' }]}
          onPress={() => {
            playSlideSound();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setFilter('pending');
          }}
          scaleTo={0.92}
          hapticStyle="selection"
          fullWidth={true}
          style={{ flex: 1 }}
        >
          <Text style={[styles.segmentText, filter === 'pending' ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
            Pending Dues
          </Text>
        </PressSpring>
        <PressSpring
          contentStyle={[styles.segmentBtn, filter === 'paid' ? { backgroundColor: '#B84600' } : { backgroundColor: 'transparent' }]}
          onPress={() => {
            playSlideSound();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setFilter('paid');
          }}
          scaleTo={0.92}
          hapticStyle="selection"
          fullWidth={true}
          style={{ flex: 1 }}
        >
          <Text style={[styles.segmentText, filter === 'paid' ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
            Paid History
          </Text>
        </PressSpring>
      </View>

      {/* Dues List */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0, marginTop: 0 }]}>
          {filter === 'pending' ? 'Outstanding Payments' : 'Payment History'} ({filteredDues.length})
        </Text>
        {filter === 'paid' && filteredDues.length > 0 && !userProfile?.isSubAdmin && (
          <PressSpring
            contentStyle={styles.clearAllBtn}
            onPress={handleClearAllCollected}
            scaleTo={0.88}
            hapticStyle="light"
            fullWidth={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="trash" size={12} color="#C46057" style={{ marginRight: 6 }} />
              <Text style={styles.clearAllBtnText}>Clear History</Text>
            </View>
          </PressSpring>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 20 }} />
      ) : filteredDues.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FontAwesome name="money" size={28} color={colors.secondaryText} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>
            {filter === 'pending' ? 'No outstanding dues.' : 'No payment history.'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {filteredDues.map((item) => (
            <View key={item.id} style={[
              styles.dueItemCard, 
              { backgroundColor: colors.card, borderColor: colors.border },
              item.status === 'paid' && { borderLeftWidth: 4, borderLeftColor: '#6B9E76' },
              item.status === 'pending' && { borderLeftWidth: 4, borderLeftColor: '#C46057' }
            ]}>
              <View style={styles.dueItemLeft}>
                <Text style={[styles.dueItemTitle, { color: colors.text }]}>{item.serviceName}</Text>
                <Text style={[styles.dueItemUser, { color: colors.secondaryText }]}>Client: {item.userName} ({item.userId})</Text>
                <Text style={[styles.dueItemTime, { color: colors.secondaryText }]}>
                  Issued: {item.date}
                </Text>
                {item.paidAt && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.dueItemTime, { color: '#6B9E76', fontWeight: '600', marginTop: 0 }]}>
                      Paid: {item.paidAt.split('T')[0]} at {item.paidAt.split('T')[1].slice(0, 5)}
                    </Text>
                    {item.paymentMethod && (
                      <Text style={[styles.dueItemTime, { color: colors.secondaryText, fontWeight: '500', marginTop: 2 }]}>
                        💳 Method: {item.paymentMethod.replace('Admin Cleared - ', '')}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.dueItemRight}>
                <Text style={[styles.dueItemAmount, { color: item.status === 'paid' ? '#6B9E76' : '#C46057', fontFamily: TheOneTypography.numberFamily }]}>
                  ₹{item.amount}
                </Text>
                {item.status === 'pending' ? (
                  <PressSpring
                    contentStyle={[styles.paidBtn, { backgroundColor: '#6B9E76' }]}
                    onPress={() => handleMarkAsPaid(item)}
                    scaleTo={0.94}
                    hapticStyle="medium"
                    fullWidth={false}
                  >
                    <Text style={styles.paidBtnText}>Clear</Text>
                  </PressSpring>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidBadgeText}>PAID</Text>
                    </View>
                    
                    <PressSpring
                      contentStyle={styles.invoiceBtn}
                      onPress={() => generateInvoice(item)}
                      scaleTo={0.92}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <FontAwesome name="file-pdf-o" size={11} color="#B84600" style={{ marginRight: 6 }} />
                        <Text style={styles.invoiceBtnText}>Invoice</Text>
                      </View>
                    </PressSpring>

                    {!userProfile?.isSubAdmin && (
                      <PressSpring
                        contentStyle={styles.clearBtn}
                        onPress={() => handleClearCollectedDue(item)}
                        scaleTo={0.94}
                        hapticStyle="medium"
                        fullWidth={false}
                      >
                        <Text style={styles.clearBtnText}>Clear</Text>
                      </PressSpring>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Success Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowSuccessModal(false)}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: 'rgba(107, 158, 118, 0.12)', borderColor: '#6B9E76', borderWidth: 1 }]}>
              <FontAwesome name="check" size={24} color="#6B9E76" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Success</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>{successModalMessage}</Text>
            <PressSpring 
              contentStyle={[styles.popupButton, { backgroundColor: colors.tint }]} 
              onPress={() => setShowSuccessModal(false)}
              scaleTo={0.94}
              hapticStyle="medium"
              fullWidth={true}
            >
              <Text style={styles.popupButtonText}>Done</Text>
            </PressSpring>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 60,
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
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    color: '#F5F0EB',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  summaryCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '700',
    marginVertical: 6,
  },
  summarySub: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '500',
  },
  segmentedRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },
  segmentBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  segmentText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueItemCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueItemLeft: {
    flex: 1,
  },
  dueItemTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  dueItemUser: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
  },
  dueItemTime: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 6,
  },
  dueItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 16,
  },
  dueItemAmount: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  paidBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  paidBtnText: {
    color: '#0B0B0B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  paidBadge: {
    backgroundColor: 'rgba(107, 158, 118, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(107, 158, 118, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  paidBadgeText: {
    color: '#6B9E76',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: TheOneTypography.bodyFamily,
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    backgroundColor: 'rgba(184, 70, 0, 0.08)',
    borderRadius: 12,
  },
  invoiceBtnText: {
    color: '#B84600',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(196, 96, 87, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 96, 87, 0.2)',
    borderRadius: 12,
  },
  clearBtnText: {
    color: '#C46057',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196, 96, 87, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 96, 87, 0.2)',
    borderRadius: 12,
  },
  clearAllBtnText: {
    color: '#C46057',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
    letterSpacing: 1,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContainer: {
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  popupIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  popupTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 20,
  },
  popupButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  popupButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
});
