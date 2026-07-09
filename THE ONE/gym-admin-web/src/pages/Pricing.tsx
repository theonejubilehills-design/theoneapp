import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  SALON_SERVICES, SPA_SERVICES, PHYSIO_SERVICES, DEFAULT_WELLNESS_PRICES 
} from '../constants/Pricing';
import { FaSave, FaTag, FaSpa, FaCut, FaPlusSquare } from 'react-icons/fa';

export const Pricing: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'wellness' | 'salon' | 'spa' | 'physio'>('wellness');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Pricing Form States
  const [wellnessPrices, setWellnessPrices] = useState<Record<string, number>>({});
  const [salonPrices, setSalonPrices] = useState<Record<string, number>>({});
  const [spaPrices, setSpaPrices] = useState<Record<string, number>>({});
  const [physioPrices, setPhysioPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'pricing'));
        const data = snap.exists() ? snap.data() : {};

        // Wellness
        const tempWellness: Record<string, number> = {};
        Object.keys(DEFAULT_WELLNESS_PRICES).forEach(key => {
          tempWellness[key] = data.wellness?.[key] ?? DEFAULT_WELLNESS_PRICES[key];
        });
        setWellnessPrices(tempWellness);

        // Salon
        const tempSalon: Record<string, number> = {};
        SALON_SERVICES.forEach(s => {
          tempSalon[s.name] = data.salon?.[s.name] ?? s.price;
        });
        setSalonPrices(tempSalon);

        // Spa
        const tempSpa: Record<string, number> = {};
        SPA_SERVICES.forEach(s => {
          tempSpa[s.name] = data.spa?.[s.name] ?? s.price;
        });
        setSpaPrices(tempSpa);

        // Physio
        const tempPhysio: Record<string, number> = {};
        PHYSIO_SERVICES.forEach(s => {
          tempPhysio[s.name] = data.physio?.[s.name] ?? s.price;
        });
        setPhysioPrices(tempPhysio);

        setLoading(false);
      } catch (err) {
        console.error("Failed to load prices from Firestore:", err);
        setLoading(false);
      }
    };

    loadPrices();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), {
        wellness: wellnessPrices,
        salon: salonPrices,
        spa: spaPrices,
        physio: physioPrices
      });
      alert('Pricing configuration saved successfully!');
    } catch (err: any) {
      alert(`Failed to save pricing: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateWellnessPrice = (key: string, val: number) => {
    setWellnessPrices(prev => ({ ...prev, [key]: val }));
  };

  const updateSalonPrice = (key: string, val: number) => {
    setSalonPrices(prev => ({ ...prev, [key]: val }));
  };

  const updateSpaPrice = (key: string, val: number) => {
    setSpaPrices(prev => ({ ...prev, [key]: val }));
  };

  const updatePhysioPrice = (key: string, val: number) => {
    setPhysioPrices(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <span className="label-spaced">SETTINGS CONTROLLER</span>
          <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Pricing Configuration</h1>
          <p className="text-muted">Modify standard service prices for members and guests.</p>
        </div>
        <button className="btn-hero" onClick={handleSave} disabled={saving || loading}>
          <FaSave /> {saving ? 'Saving...' : 'Save Prices'}
        </button>
      </div>

      {loading ? (
        <GlassCard style={{ padding: '3.0rem', textAlign: 'center' }}>
          <p className="text-muted">Fetching price listings...</p>
        </GlassCard>
      ) : (
        <div style={styles.contentLayout}>
          {/* Left: Tab selection */}
          <div style={styles.tabsSection}>
            <div
              style={{ ...styles.tabBtn, ...(activeTab === 'wellness' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('wellness')}
            >
              <FaTag /> Wellness Chambers
            </div>
            <div
              style={{ ...styles.tabBtn, ...(activeTab === 'salon' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('salon')}
            >
              <FaCut /> Hair Salon (Unisex)
            </div>
            <div
              style={{ ...styles.tabBtn, ...(activeTab === 'spa' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('spa')}
            >
              <FaSpa /> Spa & Massages
            </div>
            <div
              style={{ ...styles.tabBtn, ...(activeTab === 'physio' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('physio')}
            >
              <FaPlusSquare /> Physiotherapy
            </div>
          </div>

          {/* Right: Inputs area */}
          <div style={{ flex: 1 }}>
            <GlassCard>
              {activeTab === 'wellness' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Wellness Chambers Pricing</h3>
                  <div style={styles.formGrid}>
                    {Object.keys(wellnessPrices).map(key => (
                      <div className="form-group" key={key} style={styles.inputCard}>
                        <label className="label-spaced" style={{ fontSize: '8px' }}>
                          {key.replace('-', ' ').toUpperCase()} Price (₹)
                        </label>
                        <input
                          type="number"
                          className="input-luxury"
                          value={wellnessPrices[key]}
                          onChange={(e) => updateWellnessPrice(key, Number(e.target.value))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'salon' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Salon Unisex Pricing</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem' }}>
                    {Object.keys(salonPrices).map(key => (
                      <div key={key} style={styles.horizontalInputRow}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)', flex: 1 }}>
                          {key}
                        </span>
                        <div style={{ width: '120px' }}>
                          <input
                            type="number"
                            className="input-luxury"
                            value={salonPrices[key]}
                            onChange={(e) => updateSalonPrice(key, Number(e.target.value))}
                            style={{ textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'spa' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Spa & Massage Pricing</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem' }}>
                    {Object.keys(spaPrices).map(key => (
                      <div key={key} style={styles.horizontalInputRow}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)', flex: 1 }}>
                          {key}
                        </span>
                        <div style={{ width: '120px' }}>
                          <input
                            type="number"
                            className="input-luxury"
                            value={spaPrices[key]}
                            onChange={(e) => updateSpaPrice(key, Number(e.target.value))}
                            style={{ textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'physio' && (
                <div>
                  <h3 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Physiotherapy Sessions Pricing</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem' }}>
                    {Object.keys(physioPrices).map(key => (
                      <div key={key} style={styles.horizontalInputRow}>
                        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)', flex: 1 }}>
                          {key}
                        </span>
                        <div style={{ width: '120px' }}>
                          <input
                            type="number"
                            className="input-luxury"
                            value={physioPrices[key]}
                            onChange={(e) => updatePhysioPrice(key, Number(e.target.value))}
                            style={{ textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    ))}
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

const styles = {
  contentLayout: {
    display: 'flex',
    gap: '2.0rem',
    alignItems: 'start',
  },
  tabsSection: {
    width: '240px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.85rem 1.0rem',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    backgroundColor: 'rgba(201,122,70,0.1)',
    color: 'var(--color-accent)',
    borderColor: 'var(--color-accent-border)',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem',
  },
  inputCard: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.03)',
    padding: '1.0rem',
    borderRadius: '4px',
  },
  horizontalInputRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.03)',
    borderRadius: '4px',
    gap: '1.5rem',
  },
};

export default Pricing;
