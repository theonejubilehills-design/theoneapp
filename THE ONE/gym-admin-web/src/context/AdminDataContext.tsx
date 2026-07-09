import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';

export interface UserProfile {
  id: string;
  name: string;
  phoneNumber?: string;
  gender: 'Male' | 'Female';
  membershipType: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  isAdmin: boolean;
  isSubAdmin?: boolean;
  isStaff?: boolean;
  designation?: string;
  trialStartDate?: string;
  trialEndDate?: string;
  membershipStartDate?: string;
  membershipEndDate?: string;
  isBlocked?: boolean;
  noShowCount?: number;
}

export interface Booking {
  id: string;
  userId: string;
  userName: string;
  userGender?: 'Male' | 'Female';
  membershipType?: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'pending_join_request' | 'pending' | 'pending_group_fill';
  therapistName?: string;
  trainerName?: string;
  pilatesLevel?: string;
  steamSaunaIncluded?: boolean;
  seen?: boolean;
  saunaCategory?: string;
  isJoiner?: boolean;
  floor?: string;
  staffStatus?: string;
  staffNotes?: string;
  subService?: string;
  hbotConsecutive?: boolean;
  extended?: boolean;
  extendedTherapy?: boolean;
  saunaType?: 'sauna' | 'steam' | null;
}

export interface Due {
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

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comments?: string;
  serviceName: string;
  createdAt: string;
  status: 'new' | 'read';
}

interface AdminDataContextType {
  users: UserProfile[];
  bookings: Booking[];
  dues: Due[];
  feedbacks: Feedback[];
  loading: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
};

const parseTimeToMinutes = (timeStr?: string) => {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

export const AdminDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.isAdmin && !user?.isSubAdmin) return;

    setLoading(true);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const dbList: UserProfile[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        dbList.push({
          id: doc.id,
          name: data.name || 'Athlete',
          phoneNumber: data.phoneNumber,
          gender: data.gender || 'Female',
          membershipType: data.membershipType || 'Basic',
          isAdmin: data.isAdmin || false,
          isSubAdmin: data.isSubAdmin || false,
          isStaff: data.isStaff || false,
          designation: data.designation || '',
          trialStartDate: data.trialStartDate,
          trialEndDate: data.trialEndDate,
          membershipStartDate: data.membershipStartDate,
          membershipEndDate: data.membershipEndDate,
          isBlocked: data.isBlocked || false,
          noShowCount: data.noShowCount || 0,
        });
      });
      dbList.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(dbList);
    }, (err) => {
      console.error('Users sub failed:', err);
    });

    const unsubBookings = onSnapshot(query(collection(db, 'bookings'), orderBy('date', 'desc'), limit(300)), (snap) => {
      const dbList: Booking[] = [];
      snap.forEach((doc) => {
        dbList.push({ id: doc.id, ...doc.data() } as Booking);
      });
      dbList.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const timeA = parseTimeToMinutes(a.time.split(' - ')[0]);
        const timeB = parseTimeToMinutes(b.time.split(' - ')[0]);
        return timeA - timeB;
      });
      setBookings(dbList);
    }, (err) => {
      console.error('Bookings sub failed:', err);
    });

    const unsubDues = onSnapshot(query(collection(db, 'dues'), orderBy('date', 'desc'), limit(150)), (snap) => {
      const dbList: Due[] = [];
      snap.forEach((doc) => {
        dbList.push({ id: doc.id, ...doc.data() } as Due);
      });
      dbList.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
      setDues(dbList);
    }, (err) => {
      console.error('Dues sub failed:', err);
    });

    const unsubFeedbacks = onSnapshot(query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      const dbList: Feedback[] = [];
      snap.forEach((doc) => {
        dbList.push({ id: doc.id, ...doc.data() } as Feedback);
      });
      setFeedbacks(dbList);
      setLoading(false);
    }, (err) => {
      console.error('Feedback sub failed:', err);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubBookings();
      unsubDues();
      unsubFeedbacks();
    };
  }, [user]);

  return (
    <AdminDataContext.Provider value={{ users, bookings, dues, feedbacks, loading }}>
      {children}
    </AdminDataContext.Provider>
  );
};
