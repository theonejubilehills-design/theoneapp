import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { FaSave, FaClock, FaUsers, FaUserCog, FaPlus, FaTimes, FaEdit } from 'react-icons/fa';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseToMinutes = (h: string, m: string, ap: string): number => {
  let hour = parseInt(h);
  const min = parseInt(m);
  if (ap === 'PM' && hour !== 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  return hour * 60 + min;
};

const minutesToDisplay = (totalMins: number): string => {
  let h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
};

const buildSlotString = (h: string, m: string, ap: string, durationMins: number): string => {
  const startMins = parseToMinutes(h, m, ap);
  const endMins = startMins + durationMins;
  return `${minutesToDisplay(startMins)} - ${minutesToDisplay(endMins)}`;
};

const parseSlotToDetails = (slotStr: string): { hour: string; minute: string; period: 'AM' | 'PM'; duration: number } => {
  try {
    const [startPart, endPart] = slotStr.split(' - ');
    const parsePart = (part: string) => {
      const [time, ap] = part.split(' ');
      const [h, m] = time.split(':');
      return { h, m, ap: ap as 'AM' | 'PM' };
    };
    const start = parsePart(startPart);
    const end = parsePart(endPart);
    
    const startMins = parseToMinutes(start.h, start.m, start.ap);
    const endMins = parseToMinutes(end.h, end.m, end.ap);
    
    let duration = endMins - startMins;
    if (duration < 0) duration += 24 * 60;
    
    return {
      hour: start.h,
      minute: start.m,
      period: start.ap,
      duration
    };
  } catch (e) {
    console.error('Failed to parse slot details:', e);
    return { hour: '08', minute: '00', period: 'AM', duration: 60 };
  }
};const parseSlotToStartAndEnd = (slotStr: string) => {
  try {
    const [startPart, endPart] = slotStr.split(' - ');
    const parsePart = (part: string) => {
      const [time, ap] = part.split(' ');
      const [h, m] = time.split(':');
      return { h, m, ap: ap as 'AM' | 'PM' };
    };
    return {
      start: parsePart(startPart),
      end: parsePart(endPart)
    };
  } catch (err) {
    return {
      start: { h: '08', m: '00', ap: 'AM' as const },
      end: { h: '09', m: '00', ap: 'AM' as const }
    };
  }
};

const generateBulkSlots = (
  startH: string, startM: string, startAp: string,
  endH: string, endM: string, endAp: string,
  durationMins: number
): string[] => {
  const startMins = parseToMinutes(startH, startM, startAp);
  let endMins = parseToMinutes(endH, endM, endAp);
  if (endMins <= startMins) {
    endMins += 24 * 60; // next day fallback
  }

  const generated: string[] = [];
  let currentMins = startMins;

  while (currentMins + durationMins <= endMins) {
    const startStr = minutesToDisplay(currentMins);
    const nextMins = currentMins + durationMins;
    const endStr = minutesToDisplay(nextMins);
    generated.push(`${startStr} - ${endStr}`);
    currentMins = nextMins;
  }

  return generated;
};

const HOURS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55'];

// ─── Default Timings ──────────────────────────────────────────────────────────
const DEFAULT_TIMINGS: Record<string, { duration: number; baseTimes: string[] }> = {
  sauna: { duration: 15, baseTimes: ['08:00 AM - 08:15 AM','08:30 AM - 08:45 AM','09:00 AM - 09:15 AM','09:30 AM - 09:45 AM','10:00 AM - 10:15 AM','10:30 AM - 10:45 AM','11:00 AM - 11:15 AM','11:30 AM - 11:45 AM','02:00 PM - 02:15 PM','02:30 PM - 02:45 PM','03:00 PM - 03:15 PM','03:30 PM - 03:45 PM','04:00 PM - 04:15 PM','04:30 PM - 04:45 PM','05:00 PM - 05:15 PM','05:30 PM - 05:45 PM','06:00 PM - 06:15 PM','06:30 PM - 06:45 PM'] },
  cryo: { duration: 60, baseTimes: ['08:00 AM - 09:00 AM','09:00 AM - 10:00 AM','10:00 AM - 11:00 AM','11:00 AM - 12:00 PM','12:00 PM - 01:00 PM','01:00 PM - 02:00 PM','02:00 PM - 03:00 PM','03:00 PM - 04:00 PM','04:00 PM - 05:00 PM','05:00 PM - 06:00 PM','06:00 PM - 07:00 PM','07:00 PM - 08:00 PM','08:00 PM - 09:00 PM'] },
  'red-light': { duration: 30, baseTimes: ['08:00 AM - 08:30 AM','08:30 AM - 09:00 AM','09:00 AM - 09:30 AM','09:30 AM - 10:00 AM','10:00 AM - 10:30 AM','10:30 AM - 11:00 AM','11:00 AM - 11:30 AM','11:30 AM - 12:00 PM','12:00 PM - 12:30 PM','12:30 PM - 01:00 PM','01:00 PM - 01:30 PM','01:30 PM - 02:00 PM','02:00 PM - 02:30 PM','02:30 PM - 03:00 PM','03:00 PM - 03:30 PM','03:30 PM - 04:00 PM','04:00 PM - 04:30 PM','04:30 PM - 05:00 PM','05:00 PM - 05:30 PM','05:30 PM - 06:00 PM','06:00 PM - 06:30 PM','06:30 PM - 07:00 PM'] },
  hbot: { duration: 45, baseTimes: ['08:00 AM - 08:45 AM','08:45 AM - 09:30 AM','09:30 AM - 10:15 AM','10:15 AM - 11:00 AM','11:00 AM - 11:45 AM','11:45 AM - 12:30 PM','12:30 PM - 01:15 PM','01:15 PM - 02:00 PM','02:00 PM - 02:45 PM','02:45 PM - 03:30 PM','03:30 PM - 04:15 PM','04:15 PM - 05:00 PM','05:00 PM - 05:45 PM','05:45 PM - 06:30 PM'] },
  salon: { duration: 60, baseTimes: ['08:00 AM - 09:00 AM','09:00 AM - 10:00 AM','10:00 AM - 11:00 AM','11:00 AM - 12:00 PM','12:00 PM - 01:00 PM','02:00 PM - 03:00 PM','03:00 PM - 04:00 PM','04:00 PM - 05:00 PM','05:00 PM - 06:00 PM','06:00 PM - 07:00 PM'] },
  'general-massage': { duration: 120, baseTimes: ['08:00 AM - 10:00 AM','10:00 AM - 12:00 PM','12:00 PM - 02:00 PM','02:00 PM - 04:00 PM','04:00 PM - 06:00 PM','06:00 PM - 08:00 PM','08:00 PM - 10:00 PM'] },
  physio: { duration: 45, baseTimes: ['07:30 AM - 08:15 AM','08:15 AM - 09:00 AM','09:00 AM - 09:45 AM','09:45 AM - 10:30 AM','10:30 AM - 11:15 AM','11:15 AM - 12:00 PM'] },
  yoga: { duration: 60, baseTimes: ['07:00 AM - 08:00 AM'] },
  pilates: { duration: 60, baseTimes: ['07:00 AM - 08:00 AM','08:00 AM - 09:00 AM','09:00 AM - 10:00 AM','10:00 AM - 11:00 AM','11:00 AM - 12:00 PM'] },
  kickboxing: { duration: 60, baseTimes: ['06:00 AM - 07:00 AM','07:00 AM - 08:00 AM','08:00 AM - 09:00 AM','09:00 AM - 10:00 AM','10:00 AM - 11:00 AM'] },
};

const SERVICE_META: Record<string, { label: string; icon: string; color: string }> = {
  sauna:            { label: 'Sauna',           icon: '🔥', color: '#e07b39' },
  cryo:             { label: 'Cryo Chamber',    icon: '❄️', color: '#5bb8f5' },
  'red-light':      { label: 'Red Light',       icon: '🔴', color: '#e05252' },
  hbot:             { label: 'HBOT',            icon: '🫧', color: '#9e7cf7' },
  salon:            { label: 'Salon',           icon: '✂️', color: '#C97A46' },
  'general-massage':{ label: 'Massages',        icon: '💆', color: '#78b89e' },
  physio:           { label: 'Physio',          icon: '🩺', color: '#6aa4c0' },
  yoga:             { label: 'Yoga',            icon: '🧘', color: '#a0c87a' },
  pilates:          { label: 'Pilates',         icon: '🏋️', color: '#c8a07a' },
  kickboxing:       { label: 'Kickboxing',      icon: '🥊', color: '#e07070' },
};

const SlotTimingEditor: React.FC<{
  serviceKey: string;
  slots: string[];
  duration: number;
  onSlotsChange: (s: string[]) => void;
  onDurationChange: (d: number) => void;
  onSlotEdited?: (oldSlot: string, newSlot: string) => void;
}> = ({ serviceKey, slots, duration, onSlotsChange, onDurationChange, onSlotEdited }) => {
  const [bulkStartHour, setBulkStartHour] = useState('06');
  const [bulkStartMinute, setBulkStartMinute] = useState('00');
  const [bulkStartAmPm, setBulkStartAmPm] = useState<'AM'|'PM'>('AM');

  const [bulkEndHour, setBulkEndHour] = useState('12');
  const [bulkEndMinute, setBulkEndMinute] = useState('00');
  const [bulkEndAmPm, setBulkEndAmPm] = useState<'AM'|'PM'>('PM');

  const handleBulkGenerate = () => {
    const generated = generateBulkSlots(
      bulkStartHour,
      bulkStartMinute,
      bulkStartAmPm,
      bulkEndHour,
      bulkEndMinute,
      bulkEndAmPm,
      duration
    );
    if (generated.length === 0) {
      alert('Error: Duration is larger than the specified time range, or invalid start/end times.');
      return;
    }
    onSlotsChange(generated);
  };

  const meta = SERVICE_META[serviceKey] || { label: serviceKey, icon: '⏰', color: '#C97A46' };
  
  const handleRemove = (slot: string) => onSlotsChange(slots.filter(s => s !== slot));

  const selectStyle: React.CSSProperties = {
    background: '#1a110d',
    border: '1px solid rgba(201,122,70,0.25)',
    borderRadius: '6px',
    color: '#f1dfd7',
    padding: '8px 10px',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div>
      {/* Bulk Generate Row */}
      {serviceKey !== 'salon' && (
        <div style={{ background: 'rgba(201,122,70,0.03)', border: '1px dashed rgba(201,122,70,0.2)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#C97A46', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚡</span> Bulk Time Range Slot Divider
          </p>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            
            {/* Bulk Start Time Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#a38c81', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Start range</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={bulkStartHour}
                  onChange={e => setBulkStartHour(e.target.value)}
                  style={{ ...selectStyle, width: '70px' }}
                >
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ color: '#5c4a3f', fontWeight: 700 }}>:</span>
                <select
                  value={bulkStartMinute}
                  onChange={e => setBulkStartMinute(e.target.value)}
                  style={{ ...selectStyle, width: '70px' }}
                >
                  {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(['AM','PM'] as const).map(p => {
                    const isSelected = bulkStartAmPm === p;
                    return (
                      <button key={p} onClick={() => setBulkStartAmPm(p)} style={{
                        padding: '6px 10px', borderRadius: '4px', border: '1px solid',
                        borderColor: isSelected ? '#C97A46' : 'rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(201,122,70,0.12)' : 'transparent',
                        color: isSelected ? '#C97A46' : '#a38c81',
                        cursor: 'pointer', fontWeight: 700, fontSize: '11px',
                      }}>{p}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bulk End Time Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#a38c81', letterSpacing: '0.05em', textTransform: 'uppercase' }}>End range</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={bulkEndHour}
                  onChange={e => setBulkEndHour(e.target.value)}
                  style={{ ...selectStyle, width: '70px' }}
                >
                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={{ color: '#5c4a3f', fontWeight: 700 }}>:</span>
                <select
                  value={bulkEndMinute}
                  onChange={e => setBulkEndMinute(e.target.value)}
                  style={{ ...selectStyle, width: '70px' }}
                >
                  {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(['AM','PM'] as const).map(p => {
                    const isSelected = bulkEndAmPm === p;
                    return (
                      <button key={p} onClick={() => setBulkEndAmPm(p)} style={{
                        padding: '6px 10px', borderRadius: '4px', border: '1px solid',
                        borderColor: isSelected ? '#C97A46' : 'rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(201,122,70,0.12)' : 'transparent',
                        color: isSelected ? '#C97A46' : '#a38c81',
                        cursor: 'pointer', fontWeight: 700, fontSize: '11px',
                      }}>{p}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={handleBulkGenerate}
              style={{
                background: 'rgba(201,122,70,0.15)',
                border: '1px solid #C97A46',
                borderRadius: '8px',
                color: '#C97A46',
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '10px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#C97A46';
                e.currentTarget.style.color = '#0B0B0B';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(201,122,70,0.15)';
                e.currentTarget.style.color = '#C97A46';
              }}
            >
              Generate & Replace slots
            </button>

          </div>
          <p style={{ color: '#a38c81', fontSize: '11px', marginTop: '12px', fontStyle: 'italic' }}>
            * This divides the {bulkStartHour}:{bulkStartMinute} {bulkStartAmPm} to {bulkEndHour}:{bulkEndMinute} {bulkEndAmPm} range into contiguous {duration >= 60 ? `${duration/60} hr` : `${duration} min`} slots. Click "Save Changes" above to sync to clients.
          </p>
        </div>
      )}

      {/* Duration Row */}
      {serviceKey !== 'salon' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px', padding: '14px 16px', background: 'rgba(201,122,70,0.06)', borderRadius: '8px', border: '1px solid rgba(201,122,70,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FaClock style={{ color: meta.color, flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#a38c81', fontWeight: 600, flex: 1 }}>Slot Duration</span>
            <span style={{ fontSize: '13px', color: '#f1dfd7', fontWeight: 700 }}>
              {duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}` : `${duration} min`}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            <input
              type="range"
              min="5"
              max="180"
              step="5"
              value={duration}
              onChange={e => {
                const newDur = Number(e.target.value);
                onDurationChange(newDur);
                // Auto adjust durations of existing slots
                const updatedSlots = slots.map(slot => {
                  try {
                    const details = parseSlotToDetails(slot);
                    return buildSlotString(details.hour, details.minute, details.period, newDur);
                  } catch (err) {
                    return slot;
                  }
                });
                onSlotsChange(updatedSlots);
              }}
              style={{
                width: '100%',
                accentColor: '#C97A46',
                cursor: 'pointer',
                height: '6px',
                borderRadius: '3px',
                background: 'rgba(255,255,255,0.08)',
                outline: 'none',
              }}
            />
            <div style={{ position: 'relative', height: '14px', width: '100%' }}>
              {[
                { val: 5, label: '5m' },
                { val: 30, label: '30m' },
                { val: 60, label: '1h' },
                { val: 90, label: '1.5h' },
                { val: 120, label: '2h' },
                { val: 180, label: '3h' },
              ].map(tick => {
                const tickPct = (tick.val - 5) / 175;
                const style: React.CSSProperties = { position: 'absolute', fontSize: '9px', color: '#5c4a3f', fontWeight: 500 };
                if (tick.val === 5) {
                  style.left = '0';
                } else if (tick.val === 180) {
                  style.right = '0';
                } else {
                  style.left = `${tickPct * 100}%`;
                  style.transform = 'translateX(-50%)';
                }
                return (
                  <span key={tick.val} style={style}>
                    {tick.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Slot Chips */}
      <div>
        <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#a38c81', textTransform: 'uppercase', marginBottom: '12px' }}>
          {slots.length} Slot{slots.length !== 1 ? 's' : ''} Configured
        </p>
        {slots.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#5c4a3f', fontSize: '13px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            No slots yet. Use the divider above to generate them.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {slots.map(slot => (
              <div key={slot} style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '7px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${meta.color}40`,
                borderRadius: '8px',
                fontSize: '12px', fontWeight: 600,
                color: '#f1dfd7',
              }}>
                <span style={{ color: meta.color, fontSize: '10px' }}>⏱</span>
                {slot}

                {/* Remove Button */}
                <button onClick={() => handleRemove(slot)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#5c4a3f', fontSize: '12px', padding: '0 0 0 2px',
                  display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e07070')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#5c4a3f')}
                  title="Remove Slot"
                >
                  <FaTimes size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Settings Page ───────────────────────────────────────────────────────
export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'timings' | 'trainers' | 'staff'>('timings');
  const [selectedService, setSelectedService] = useState<string>('sauna');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [serviceTimings, setServiceTimings] = useState<Record<string, { duration: number; baseTimes: string[] }>>(DEFAULT_TIMINGS);
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, string>>>({});

  const handleSlotEdited = (serviceId: string, oldSlot: string, newSlot: string) => {
    setPendingEdits(prev => {
      const svcEdits = { ...(prev[serviceId] || {}) };
      const reverseLookup = Object.entries(svcEdits).find(([_, curr]) => curr === oldSlot);
      if (reverseLookup) {
        const [originalSlot] = reverseLookup;
        svcEdits[originalSlot] = newSlot;
      } else {
        svcEdits[oldSlot] = newSlot;
      }
      return {
        ...prev,
        [serviceId]: svcEdits
      };
    });
  };

  const [trainersConfig, setTrainersConfig] = useState({
    yogaCapacity: '10', yogaTrainer: 'Sarah', yogaTrainerDayOff: 'None',
    pilatesCapacity: '3', pilatesTrainer: 'Elena', pilatesTrainerDayOff: 'None',
    kickboxingCapacity: '5', kickboxingTrainer: 'Coach Marcus', kickboxingTrainerDayOff: 'None',
    physioTherapist: 'Dr. Shawn (Physio)', physioTherapistDayOff: 'None',
    salonProfessionals: 'Salon Professional', salonProfessionalsDayOff: 'None',
  });

  const [staffConfig, setStaffConfig] = useState({
    massageMale1: 'Vikram', massageMale1DayOff: 'None',
    massageMale2: 'Ragesh', massageMale2DayOff: 'None',
    massageFemale1: 'Ananya', massageFemale1DayOff: 'None',
    massageFemale2: 'Priya', massageFemale2DayOff: 'None',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [servSnap, globalSnap, staffSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'services')),
          getDoc(doc(db, 'settings', 'global')),
          getDoc(doc(db, 'settings', 'staff')),
        ]);
        if (servSnap.exists()) {
          const data = servSnap.data();
          const merged = { ...DEFAULT_TIMINGS };
          Object.keys(DEFAULT_TIMINGS).forEach(k => {
            if (data[k]) merged[k] = { duration: data[k].duration ?? DEFAULT_TIMINGS[k].duration, baseTimes: data[k].baseTimes ?? DEFAULT_TIMINGS[k].baseTimes };
          });
          setServiceTimings(merged);
        }
        if (globalSnap.exists()) {
          const d = globalSnap.data();
          setTrainersConfig(p => ({ ...p, ...Object.fromEntries(Object.keys(p).map(k => [k, d[k] ?? p[k as keyof typeof p]])) }));
        }
        if (staffSnap.exists()) {
          const d = staffSnap.data();
          setStaffConfig(p => ({ ...p, ...Object.fromEntries(Object.keys(p).map(k => [k, d[k] ?? p[k as keyof typeof p]])) }));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const selectDropdownStyle: React.CSSProperties = {
    background: '#1a110d',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#f1dfd7',
    padding: '8px 10px',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
    marginTop: '4px'
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'timings') {
        await setDoc(doc(db, 'settings', 'services'), serviceTimings);

        const todayStr = new Date().toISOString().split('T')[0];
        let totalUpdatedBookings = 0;

        // Verify if we have any changes to process
        const hasChanges = Object.values(pendingEdits).some(edits =>
          Object.entries(edits).some(([oldTime, newTime]) => oldTime !== newTime)
        );

        if (hasChanges) {
          // Query all bookings from today onwards once. This uses only a single-field
          // index on 'date' and avoids requiring any composite indexes on Firestore.
          const bookingsRef = collection(db, 'bookings');
          const q = query(
            bookingsRef,
            where('date', '>=', todayStr)
          );

          const snap = await getDocs(q);
          const futureBookings = snap.docs;

          for (const [serviceId, edits] of Object.entries(pendingEdits)) {
            for (const [oldTime, newTime] of Object.entries(edits)) {
              if (oldTime === newTime) continue;

              // Filter in-memory to find bookings matching this service and old slot timing
              const matches = futureBookings.filter(docSnap => {
                const bData = docSnap.data();
                return bData.serviceId === serviceId && bData.time === oldTime;
              });

              if (matches.length > 0) {
                const updatePromises = matches.map(docSnap =>
                  updateDoc(doc(db, 'bookings', docSnap.id), { time: newTime })
                );
                await Promise.all(updatePromises);
                totalUpdatedBookings += matches.length;
              }
            }
          }
        }

        if (totalUpdatedBookings > 0) {
          console.log(`Successfully updated ${totalUpdatedBookings} booking(s) with new slot timings.`);
        }
        setPendingEdits({});
      }
      else if (activeTab === 'trainers') await setDoc(doc(db, 'settings', 'global'), trainersConfig);
      else await setDoc(doc(db, 'settings', 'staff'), staffConfig);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      alert('Settings and slot configurations have been saved successfully to the database!');
    } catch (err: any) { alert(`Save failed: ${err.message}`); }
    setSaving(false);
  };

  const updateSlots = (key: string, slots: string[]) =>
    setServiceTimings(p => ({ ...p, [key]: { ...p[key], baseTimes: slots } }));
  const updateDuration = (key: string, dur: number) =>
    setServiceTimings(p => ({ ...p, [key]: { ...p[key], duration: dur } }));

  const inputStyle: React.CSSProperties = {
    background: '#1a110d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
    color: '#f1dfd7', padding: '9px 12px', fontSize: '13px', width: '100%', outline: 'none',
    fontFamily: "Inter, sans-serif",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
        <div>
          <span className="label-spaced">PORTAL CONFIGURATION</span>
          <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Global Settings</h1>
          <p className="text-muted">Configure service time slots, durations, trainers, and club staff.</p>
        </div>
        <button
          className="btn-hero"
          onClick={handleSave}
          disabled={saving || loading}
          style={{ position: 'relative', minWidth: '160px' }}
        >
          {saved ? '✓ Saved!' : <><FaSave style={{ marginRight: '8px' }} />{saving ? 'Saving...' : 'Save Changes'}</>}
        </button>
      </div>

      {loading ? (
        <GlassCard style={{ padding: '3rem', textAlign: 'center' }}>
          <p className="text-muted">Loading configuration...</p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'start' }}>
          {/* Left sidebar tabs */}
          <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            {([
              { key: 'timings',  icon: <FaClock />,   label: 'Timings & Slots' },
              { key: 'trainers', icon: <FaUsers />,   label: 'Capacity & Trainers' },
              { key: 'staff',    icon: <FaUserCog />, label: 'Staff Directory' },
            ] as const).map(t => (
              <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderRadius: '6px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
                backgroundColor: activeTab === t.key ? 'rgba(201,122,70,0.12)' : 'var(--color-surface)',
                color: activeTab === t.key ? '#C97A46' : 'var(--color-text-secondary)',
                border: `1px solid ${activeTab === t.key ? 'rgba(201,122,70,0.3)' : 'var(--color-border)'}`,
                borderLeft: activeTab === t.key ? '3px solid #C97A46' : '1px solid var(--color-border)',
              }}>
                {t.icon} {t.label}
              </div>
            ))}

            {/* Service sub-nav (only for timings tab) */}
            {activeTab === 'timings' && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#5c4a3f', textTransform: 'uppercase', padding: '0 4px', marginBottom: '4px' }}>Services</p>
                {Object.keys(DEFAULT_TIMINGS).map(key => {
                  const m = SERVICE_META[key];
                  const isSelected = selectedService === key;
                  return (
                    <div key={key} onClick={() => setSelectedService(key)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 500,
                      background: isSelected ? `${m?.color}18` : 'transparent',
                      color: isSelected ? (m?.color || '#C97A46') : '#a38c81',
                      borderLeft: isSelected ? `3px solid ${m?.color || '#C97A46'}` : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                      <span style={{ fontSize: '14px' }}>{m?.icon}</span>
                      {m?.label || key}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <GlassCard>
              {/* ── TIMINGS TAB ── */}
              {activeTab === 'timings' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <span style={{ fontSize: '24px' }}>{SERVICE_META[selectedService]?.icon}</span>
                    <div>
                      <h3 className="title-card" style={{ fontStyle: 'italic', margin: 0 }}>
                        {SERVICE_META[selectedService]?.label} Slot Timings
                      </h3>
                      <p style={{ color: '#a38c81', fontSize: '12px', margin: '2px 0 0 0' }}>
                        {selectedService === 'salon' ? 'Add / remove time slots for this service.' : 'Set the duration then add / remove time slots for this service.'}
                      </p>
                    </div>
                  </div>
                  <SlotTimingEditor
                    serviceKey={selectedService}
                    slots={serviceTimings[selectedService]?.baseTimes ?? []}
                    duration={serviceTimings[selectedService]?.duration ?? 60}
                    onSlotsChange={s => updateSlots(selectedService, s)}
                    onDurationChange={d => updateDuration(selectedService, d)}
                    onSlotEdited={(oldSlot, newSlot) => handleSlotEdited(selectedService, oldSlot, newSlot)}
                  />
                </div>
              )}

              {/* ── TRAINERS TAB ── */}
              {activeTab === 'trainers' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Trainer & Capacity Configuration</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: '1.5rem' }}>
                    {[
                      { title: 'Yoga', cap: 'yogaCapacity', trainer: 'yogaTrainer', dayOff: 'yogaTrainerDayOff', color: '#a0c87a' },
                      { title: 'Pilates', cap: 'pilatesCapacity', trainer: 'pilatesTrainer', dayOff: 'pilatesTrainerDayOff', color: '#c8a07a' },
                      { title: 'Kickboxing', cap: 'kickboxingCapacity', trainer: 'kickboxingTrainer', dayOff: 'kickboxingTrainerDayOff', color: '#e07070' },
                    ].map(({ title, cap, trainer, dayOff, color }) => (
                      <div key={title} style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${color}30`, borderRadius: '10px', padding: '16px' }}>
                        <h4 style={{ color, marginBottom: '12px', fontSize: '14px' }}>{title}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label className="label-spaced" style={{ fontSize: '7px' }}>Max Capacity</label>
                            <input type="number" style={inputStyle} value={(trainersConfig as any)[cap]} onChange={e => setTrainersConfig(p => ({ ...p, [cap]: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label-spaced" style={{ fontSize: '7px' }}>Trainer Name</label>
                            <input type="text" style={inputStyle} value={(trainersConfig as any)[trainer]} onChange={e => setTrainersConfig(p => ({ ...p, [trainer]: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label-spaced" style={{ fontSize: '7px' }}>Day Off</label>
                            <select style={selectDropdownStyle} value={(trainersConfig as any)[dayOff]} onChange={e => setTrainersConfig(p => ({ ...p, [dayOff]: e.target.value }))}>
                              {['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(106,164,192,0.3)', borderRadius: '10px', padding: '16px' }}>
                      <h4 style={{ color: '#6aa4c0', marginBottom: '12px', fontSize: '14px' }}>Physiotherapy</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>Physiotherapist Name</label>
                          <input type="text" style={inputStyle} value={trainersConfig.physioTherapist} onChange={e => setTrainersConfig(p => ({ ...p, physioTherapist: e.target.value }))} />
                        </div>
                        <div>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>Day Off</label>
                          <select style={selectDropdownStyle} value={trainersConfig.physioTherapistDayOff} onChange={e => setTrainersConfig(p => ({ ...p, physioTherapistDayOff: e.target.value }))}>
                            {['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(201,122,70,0.3)', borderRadius: '10px', padding: '16px' }}>
                      <h4 style={{ color: '#C97A46', marginBottom: '12px', fontSize: '14px' }}>Salon</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>Staff Name / Label</label>
                          <input type="text" style={inputStyle} value={trainersConfig.salonProfessionals} onChange={e => setTrainersConfig(p => ({ ...p, salonProfessionals: e.target.value }))} />
                        </div>
                        <div>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>Day Off</label>
                          <select style={selectDropdownStyle} value={trainersConfig.salonProfessionalsDayOff} onChange={e => setTrainersConfig(p => ({ ...p, salonProfessionalsDayOff: e.target.value }))}>
                            {['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STAFF TAB ── */}
              {activeTab === 'staff' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Massage Therapists Directory</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(91,184,245,0.2)', borderRadius: '10px', padding: '16px' }}>
                      <h4 style={{ color: '#5bb8f5', marginBottom: '14px', fontSize: '14px' }}>♂ Male Therapists</h4>
                      {[['massageMale1', 'massageMale1DayOff', 'Therapist 1'], ['massageMale2', 'massageMale2DayOff', 'Therapist 2']].map(([nameKey, offKey, l]) => (
                        <div key={nameKey} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>{l} Name</label>
                          <input type="text" style={inputStyle} value={(staffConfig as any)[nameKey]} onChange={e => setStaffConfig(p => ({ ...p, [nameKey]: e.target.value }))} />
                          <label className="label-spaced" style={{ fontSize: '7px', marginTop: '4px' }}>{l} Day Off</label>
                          <select style={selectDropdownStyle} value={(staffConfig as any)[offKey]} onChange={e => setStaffConfig(p => ({ ...p, [offKey]: e.target.value }))}>
                            {['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(224,112,112,0.2)', borderRadius: '10px', padding: '16px' }}>
                      <h4 style={{ color: '#e07070', marginBottom: '14px', fontSize: '14px' }}>♀ Female Therapists</h4>
                      {[['massageFemale1', 'massageFemale1DayOff', 'Therapist 1'], ['massageFemale2', 'massageFemale2DayOff', 'Therapist 2']].map(([nameKey, offKey, l]) => (
                        <div key={nameKey} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label className="label-spaced" style={{ fontSize: '7px' }}>{l} Name</label>
                          <input type="text" style={inputStyle} value={(staffConfig as any)[nameKey]} onChange={e => setStaffConfig(p => ({ ...p, [nameKey]: e.target.value }))} />
                          <label className="label-spaced" style={{ fontSize: '7px', marginTop: '4px' }}>{l} Day Off</label>
                          <select style={selectDropdownStyle} value={(staffConfig as any)[offKey]} onChange={e => setStaffConfig(p => ({ ...p, [offKey]: e.target.value }))}>
                            {['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
