import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { FaUsers, FaCalendarCheck, FaHourglassHalf, FaStar } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { playClickSound } from '../utils/sound';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
// @ts-ignore
import XLSX from 'xlsx-js-style';

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

const getSalonServiceDuration = (name: string): number => {
  if (!name) return 30;
  if (name.includes('Beard Trim')) return 15;
  if (name.includes('Shaving')) return 20;
  if (name.includes('Head Shave')) return 30;
  if (name.includes('Hair wash + Blowdry (Men)')) return 25;
  if (name.includes('Hair Color Root Touch-up (Men)')) return 45;
  if (name.includes('Haircut + Hairwash + Blowdry (Men)')) return 45;
  if (name.includes('Hair wash + Simple Blowdry (Women)')) return 45;
  if (name.includes('Hair wash + Soft Curls')) return 60;
  if (name.includes('Hair wash + Tong Curls')) return 60;
  if (name.includes('Hair Color Root Touch-up (Women)')) return 60;
  return 30;
};

const getBookingDuration = (b: any) => {
  const timePart = b.time || '';
  if (timePart.includes(' - ')) {
    const parts = timePart.split(' - ');
    const start = parseTimeToMinutes(parts[0]);
    const end = parseTimeToMinutes(parts[1]);
    if (end > start) return end - start;
    if (end < start) return (end + 24 * 60) - start;
  }
  if (b.serviceId === 'salon') {
    const subSvc = b.subService || '';
    const subSvcList = subSvc.split(', ');
    return subSvcList.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
  }
  if (b.serviceId === 'general-massage') {
    return b.extended ? 180 : 120;
  }
  if (b.serviceId === 'sauna') return 15;
  if (b.serviceId === 'cryo') return 60;
  if (b.serviceId === 'hbot') return b.hbotConsecutive ? 60 : 30;
  if (b.serviceId === 'red-light') return b.extendedTherapy ? 60 : 30;
  if (b.serviceId === 'physio') return 45;
  return 60;
};

const getDatesInRange = (startStr: string, endStr: string) => {
  const dates = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let current = new Date(start);
  while (current <= end) {
    const yr = current.getFullYear();
    const mo = String(current.getMonth() + 1).padStart(2, '0');
    const da = String(current.getDate()).padStart(2, '0');
    dates.push({
      dateStr: `${yr}-${mo}-${da}`,
      dayName: daysOfWeek[current.getDay()]
    });
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const getStaffStatusForDay = (staff: any, dateStr: string, bookingsOnDay: any[]) => {
  const leaves = staff.leaves || staff.leaveDays || [];
  if (Array.isArray(leaves) && leaves.includes(dateStr)) {
    return 'Leave';
  }
  if (typeof leaves === 'string' && leaves.split(',').map((s: string) => s.trim()).includes(dateStr)) {
    return 'Leave';
  }

  const dateObj = new Date(dateStr);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = daysOfWeek[dateObj.getDay()];
  let weekOff = staff.weekOff || staff.weekOffs || '';
  if (!weekOff) {
    weekOff = 'Sunday';
  }
  if (typeof weekOff === 'string' && weekOff.toLowerCase() === dayName.toLowerCase()) {
    return 'Week off';
  }
  if (Array.isArray(weekOff) && weekOff.map((s: string) => s.toLowerCase()).includes(dayName.toLowerCase())) {
    return 'Week off';
  }

  if (bookingsOnDay.length > 0) {
    return bookingsOnDay.map(b => {
      const startTime = b.time.split(' - ')[0];
      const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
      let statusStr = '';
      if (b.status === 'cancelled') statusStr = ' (Cancelled)';
      else if (b.status === 'no_show') statusStr = ' (no show)';
      return `${b.subService || b.serviceName} for ${prefix} ${b.userName} at ${startTime}${statusStr}`;
    }).join('\n');
  }

  return 'No appointments';
};

export const Dashboard: React.FC = () => {
  const { users, bookings, dues, feedbacks } = useAdminData();

  // Export & Report State
  const [exportType, setExportType] = useState<'bookings' | 'payments' | 'members'>('bookings');
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const handleExportExcel = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      let headers: string[] = [];
      let rows: any[][] = [];
      let filename = `THE_ONE_${exportType}_export`;

      if (exportType === 'bookings') {
        headers = [
          'Date', 'Time', 'Member', 'Service Category',
          'Duration (mins)', 'Service Name', 'Package', 'Amount Paid (₹)', 'Amount Not Paid (₹)',
          'Note', 'Trainer/Therapist Name'
        ];
        const filtered = bookings.filter(b => b.date && b.date >= startDate && b.date <= endDate);
        rows = filtered.map(b => {
          const userProf = users.find(u => u.id === b.userId || u.phoneNumber === b.userId);
          const membership = b.membershipType || userProf?.membershipType || 'Basic';
          
          const duration = getBookingDuration(b);
          const isBasic = membership === 'Basic';
          let amountPaid = 0;
          let amountNotPaid = 0;

          if (isBasic) {
            const matchingDue = dues.find(d => 
              d.userId === b.userId && 
              d.date === b.date && 
              (d.serviceName === b.subService || d.serviceName === b.serviceName)
            );
            if (matchingDue) {
              if (matchingDue.status === 'paid') {
                amountPaid = matchingDue.amount;
              } else {
                amountNotPaid = matchingDue.amount;
              }
            }
          }

          return [
            b.date,
            b.time,
            b.userName,
            b.serviceName,
            duration,
            b.subService || '',
            membership,
            amountPaid,
            amountNotPaid,
            '', // Note (blank space column)
            b.therapistName || b.trainerName || 'Unassigned'
          ];
        });
        filename += `_${startDate}_to_${endDate}`;
      } else if (exportType === 'payments') {
        headers = [
          'Due/Transaction ID', 'Member Name', 'Membership Type', 'Service/Item',
          'Amount (₹)', 'Due Date', 'Status', 'Created At', 'Settled At', 'Payment Method'
        ];
        const filtered = dues.filter(d => d.date && d.date >= startDate && d.date <= endDate);
        rows = filtered.map(d => {
          const userProf = users.find(u => u.id === d.userId || u.phoneNumber === d.userId);
          const membership = userProf?.membershipType || 'Basic';
          return [
            d.id,
            d.userName,
            membership,
            d.serviceName,
            d.amount,
            d.date,
            d.status,
            d.createdAt || '',
            d.paidAt || '',
            d.paymentMethod || ''
          ];
        });
        filename += `_${startDate}_to_${endDate}`;
      } else if (exportType === 'members') {
        headers = [
          'Member ID', 'Full Name', 'Gender', 'Membership Type',
          'Status', 'Trial Start', 'Trial End', 'Membership Start', 'Membership End', 'No-Show Count'
        ];
        const filtered = users.filter(u => {
          const start = u.membershipStartDate || u.trialStartDate;
          if (!start) return false;
          return start >= startDate && start <= endDate;
        });
        rows = filtered.map(u => [
          u.id,
          u.name,
          u.gender,
          u.membershipType,
          u.isBlocked ? 'Blocked' : 'Active',
          u.trialStartDate || '',
          u.trialEndDate || '',
          u.membershipStartDate || '',
          u.membershipEndDate || '',
          u.noShowCount || 0
        ]);
        filename += `_registered_${startDate}_to_${endDate}`;
      }

      if (rows.length === 0) {
        alert(`No data found for the selected report type and date range (${startDate} to ${endDate}).`);
        return;
      }

      // Safe access to XLSX library
      const utils = XLSX.utils;
      const write = XLSX.write;

      if (!utils || !write) {
        throw new Error("SheetJS (XLSX) library functions are not loaded correctly.");
      }

      // Prepend Title Banner and Empty Row
      let titleLabel = '';
      if (exportType === 'bookings') titleLabel = 'THE ONE - Bookings Report';
      else if (exportType === 'payments') titleLabel = 'THE ONE - Payments Report';
      else titleLabel = 'THE ONE - Registered Members Report';

      const titleRow = [`${titleLabel} (${startDate} to ${endDate})`];
      const emptyRow = [];
      const aoaData = [titleRow, emptyRow, headers, ...rows];

      const worksheet = utils.aoa_to_sheet(aoaData);

      // Merge Title Banner across all columns
      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }
      ];

      const range = utils.decode_range(worksheet['!ref'] || 'A1:A1');
      
      // Format Title Banner
      const titleCell = worksheet[utils.encode_cell({ r: 0, c: 0 })];
      if (titleCell) {
        titleCell.s = {
          font: {
            bold: true,
            color: { rgb: "5C4A3F" },
            name: "Arial",
            sz: 13
          },
          fill: {
            fgColor: { rgb: "F5ECE5" }
          },
          alignment: {
            horizontal: "center",
            vertical: "center"
          }
        };
      }

      // Format headers: White bold text on premium burnt orange background with borders (at row 2)
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = utils.encode_cell({ r: 2, c: col });
        const cell = worksheet[cellAddress];
        if (cell) {
          cell.s = {
            font: {
              bold: true,
              color: { rgb: "FFFFFF" }, // White text
              name: "Arial",
              sz: 10
            },
            fill: {
              fgColor: { rgb: "C97A46" } // Premium burnt orange background
            },
            alignment: {
              horizontal: "center",
              vertical: "center",
              wrapText: true
            },
            border: {
              bottom: { style: "medium", color: { rgb: "A65D2E" } },
              top: { style: "thin", color: { rgb: "C97A46" } },
              left: { style: "thin", color: { rgb: "C97A46" } },
              right: { style: "thin", color: { rgb: "C97A46" } }
            }
          };
        }
      }

      // Format data cells: starts at row 3 (offset of 3)
      for (let r = 3; r < rows.length + 3; r++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = utils.encode_cell({ r, c: col });
          const cell = worksheet[cellAddress];
          if (cell) {
            const header = headers[col] || '';
            const isNumber = header.includes('Amount') || header.includes('Count');
            const isCentered = header.includes('Status') || header.includes('Date') || header.includes('Time') || header.includes('Type') || header.includes('Gender');

            cell.s = {
              font: {
                name: "Arial",
                sz: 9
              },
              alignment: {
                vertical: "center",
                horizontal: isNumber ? "right" : (isCentered ? "center" : "left")
              },
              border: {
                bottom: { style: "thin", color: { rgb: "E5E5E5" } },
                left: { style: "thin", color: { rgb: "F1F1F1" } },
                right: { style: "thin", color: { rgb: "F1F1F1" } }
              }
            };

            // Format Currency
            if (header.includes('Amount')) {
              cell.t = 'n';
              cell.z = '₹#,##0';
            }
          }
        }
      }

      // Calculate column widths dynamically to autofit content neatly
      const colWidths = headers.map((h, colIndex) => {
        let maxLen = h.length;
        rows.forEach(row => {
          const cellVal = String(row[colIndex] ?? '');
          if (cellVal.length > maxLen) {
            maxLen = cellVal.length;
          }
        });
        return { wch: Math.min(Math.max(maxLen + 4, 12), 50) };
      });
      worksheet['!cols'] = colWidths;

      // Set row heights: 32pt for Title, 15pt for empty spacing, 28pt for header row, 20pt for data rows
      const rowHeights = [];
      rowHeights.push({ hpt: 32 }); // Title row
      rowHeights.push({ hpt: 15 }); // Spacer row
      rowHeights.push({ hpt: 28 }); // Header
      for (let r = 0; r < rows.length; r++) {
        rowHeights.push({ hpt: 20 });
      }
      worksheet['!rows'] = rowHeights;

      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, 'Report');

      // Convert workbook to Uint8Array
      const u8array = write(workbook, { bookType: 'xlsx', type: 'array' });

      // Create blob with generic binary type to bypass scanning issues
      const blob = new Blob([u8array], { type: 'application/octet-stream' });

      // Trigger download using Blob URL with deferred cleanup
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Defer removal to allow the browser to process the download name correctly
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export Excel file: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportWeeklyReport = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      if (new Date(endDate) < new Date(startDate)) {
        alert("End Date cannot be before Start Date");
        return;
      }

      const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
      const globalSettings = settingsSnap.exists() ? settingsSnap.data() : {
        yogaTrainer: 'Sarah',
        pilatesTrainer: 'Elena',
        kickboxingTrainer: 'Coach Marcus',
        physioTherapist: 'Dr. Shawn (Physio)'
      };

      const rangeDates = getDatesInRange(startDate, endDate);
      const filename = `THE_ONE_weekly_report_${rangeDates[0].dateStr}_to_${rangeDates[rangeDates.length - 1].dateStr}`;

      const staffUsers = users.filter(u => u.isStaff);
      const classTrainers = [
        globalSettings.yogaTrainer || 'Sarah',
        globalSettings.pilatesTrainer || 'Elena',
        globalSettings.kickboxingTrainer || 'Coach Marcus',
        globalSettings.physioTherapist || 'Dr. Shawn (Physio)'
      ].map(name => name.toLowerCase());

      const therapistStaff = staffUsers.filter(u => {
        const nameLower = u.name.toLowerCase();
        return !classTrainers.some(trainer => nameLower.includes(trainer) || trainer.includes(nameLower));
      });

      const therapistRows = therapistStaff.map(u => {
        const label = `${u.name}${u.designation ? ' (' + u.designation + ')' : ''}`;
        const cols = rangeDates.map(wd => {
          const bookingsOnDay = bookings.filter(b => 
            b.date === wd.dateStr && 
            b.status === 'confirmed' && 
            (b.therapistName === u.name || b.trainerName === u.name)
          );
          return getStaffStatusForDay(u, wd.dateStr, bookingsOnDay);
        });
        return [label, ...cols];
      });

      const pilatesSlotLabels = ['7AM to 8AM', '8AM to 9AM', '9AM to 10AM', '10AM to 11AM', '11AM to 12PM'];
      const pilatesSlotsDb = ['07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM'];
      const pilatesRows = pilatesSlotsDb.map((slotDb, idx) => {
        const label = pilatesSlotLabels[idx];
        const cols = rangeDates.map(wd => {
          const dayOfWeek = new Date(wd.dateStr).getDay();
          if (dayOfWeek === 0) return 'Sunday';
          const slotBookings = bookings.filter(b => 
            b.date === wd.dateStr && 
            b.serviceId === 'pilates' && 
            b.time === slotDb
          );
          if (slotBookings.length === 0) return '';
          return slotBookings.map(b => {
            const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
            let statusStr = '';
            if (b.status === 'cancelled') statusStr = ' (Cancelled)';
            else if (b.status === 'no_show') statusStr = ' (no show)';
            return `${prefix} ${b.userName}${statusStr}`;
          }).join('\n');
        });
        return [label, ...cols];
      });

      const kbSlotLabels = ['7 AM to 8AM', '8 AM to 9 AM', '9 AM to 10 AM', '10 AM to 11 AM', '11 AM to 12 PM'];
      const kbSlotsDb = ['07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM'];
      const kickboxingRows = kbSlotsDb.map((slotDb, idx) => {
        const label = kbSlotLabels[idx];
        const cols = rangeDates.map(wd => {
          const dayOfWeek = new Date(wd.dateStr).getDay();
          if (dayOfWeek === 0) return 'Sunday';
          const slotBookings = bookings.filter(b => 
            b.date === wd.dateStr && 
            b.serviceId === 'kickboxing' && 
            b.time === slotDb
          );
          if (slotBookings.length === 0) return '';
          return slotBookings.map(b => {
            const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
            let statusStr = '';
            if (b.status === 'cancelled') statusStr = ' (Cancelled)';
            else if (b.status === 'no_show') statusStr = ' (no show)';
            return `${prefix} ${b.userName}${statusStr}`;
          }).join('\n');
        });
        return [label, ...cols];
      });

      const physioSlotLabels = ['7:30 AM to 8:10 AM', '8:10 AM to 8:50 AM', '8:50 AM to 9:30 AM', '9:30 AM to 10:10 AM', '10:10 AM to 10:50 AM', '10:50 AM to 11:30 AM'];
      const physioSlotsDb = ['07:30 AM - 08:15 AM', '08:15 AM - 09:00 AM', '09:00 AM - 09:45 AM', '09:45 AM - 10:30 AM', '10:30 AM - 11:15 AM', '11:15 AM - 12:00 PM'];
      const physioRows = physioSlotsDb.map((slotDb, idx) => {
        const label = physioSlotLabels[idx];
        const cols = rangeDates.map(wd => {
          const dayOfWeek = new Date(wd.dateStr).getDay();
          if (dayOfWeek === 0) return 'Sunday';
          const slotBookings = bookings.filter(b => 
            b.date === wd.dateStr && 
            b.serviceId === 'physio' && 
            b.time === slotDb
          );
          if (slotBookings.length === 0) return '';
          return slotBookings.map(b => {
            const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
            let statusStr = '';
            if (b.status === 'cancelled') statusStr = ' (Cancelled)';
            else if (b.status === 'no_show') statusStr = ' (no show)';
            return `${prefix} ${b.userName}${statusStr}`;
          }).join('\n');
        });
        return [label, ...cols];
      });

      const cryoBookingsByDay = rangeDates.map(wd => {
        return bookings.filter(b => b.date === wd.dateStr && b.serviceId === 'cryo');
      });
      const maxCryoRows = Math.max(...cryoBookingsByDay.map(list => list.length), 3);
      const cryoDataRows = [];
      for (let r = 0; r < maxCryoRows; r++) {
        const rowVal = ['', ...rangeDates.map((wd, dayIdx) => {
          const dayOfWeek = new Date(wd.dateStr).getDay();
          if (dayOfWeek === 0) return 'Sunday';
          const list = cryoBookingsByDay[dayIdx];
          const b = list[r];
          if (!b) return '';
          const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
          const startTime = b.time.split(' - ')[0];
          let statusStr = '';
          if (b.status === 'cancelled') statusStr = ' (cancelled)';
          else if (b.status === 'no_show') statusStr = ' (no show)';
          return `${prefix} ${b.userName} at ${startTime}${statusStr}`;
        })];
        cryoDataRows.push(rowVal);
      }

      const yogaBookingsByDay = rangeDates.map(wd => {
        return bookings.filter(b => b.date === wd.dateStr && b.serviceId === 'yoga');
      });
      const maxYogaRows = Math.max(...yogaBookingsByDay.map(list => list.length), 3);
      const yogaDataRows = [];
      for (let r = 0; r < maxYogaRows; r++) {
        const rowVal = ['', ...rangeDates.map((wd, dayIdx) => {
          const dayOfWeek = new Date(wd.dateStr).getDay();
          if (dayOfWeek === 0) return 'Sunday';
          const list = yogaBookingsByDay[dayIdx];
          const b = list[r];
          if (!b) return '';
          const prefix = b.userGender === 'Male' ? 'Mr.' : 'Ms.';
          let statusStr = '';
          if (b.status === 'cancelled') statusStr = ' (Cancelled)';
          else if (b.status === 'no_show') statusStr = ' (no show)';
          return `${prefix} ${b.userName}${statusStr}`;
        })];
        yogaDataRows.push(rowVal);
      }

      const titleRow = [`THE ONE - Weekly Schedule Report (${startDate} to ${endDate})`, ...Array(rangeDates.length).fill('')];
      const emptyRow = Array(rangeDates.length + 1).fill('');
      const aoa: any[][] = [titleRow, emptyRow];
      const headerRow1 = ['', ...rangeDates.map(wd => {
        const dObj = new Date(wd.dateStr);
        const dayNum = wd.dateStr.split('-')[2];
        const monthName = dObj.toLocaleString('en-US', { month: 'long' });
        return `${dayNum} ${monthName}`;
      })];
      const headerRow2 = ['Day', ...rangeDates.map(wd => wd.dayName)];

      const therapistStartRow = aoa.length;
      aoa.push(headerRow1);
      aoa.push(headerRow2);
      therapistRows.forEach(r => aoa.push(r));
      const therapistEndRow = aoa.length - 1;

      aoa.push([]);
      aoa.push([]);

      const pilatesTitleRow = aoa.length;
      aoa.push(['Pilates', ...Array(rangeDates.length).fill('')]);
      const pilatesHeaderRow1 = aoa.length;
      aoa.push(headerRow1);
      const pilatesHeaderRow2 = aoa.length;
      aoa.push(['Time Slot', ...rangeDates.map(wd => {
        const dayOfWeek = new Date(wd.dateStr).getDay();
        if (dayOfWeek === 1 || dayOfWeek === 5) return `${wd.dayName}\nBeginner Session (Low Intensity)`;
        if (dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6) return `${wd.dayName}\nAdvanced Session (High Intensity)`;
        if (dayOfWeek === 3) return `${wd.dayName}\nVery Light (Focused on Stretching)`;
        return 'Sunday';
      })]);
      const pilatesDataStartRow = aoa.length;
      pilatesRows.forEach(r => aoa.push(r));
      const pilatesEndRow = aoa.length - 1;

      aoa.push([]);
      aoa.push([]);

      const kbTitleRow = aoa.length;
      aoa.push(['Kickboxing', ...Array(rangeDates.length).fill('')]);
      const kbHeaderRow1 = aoa.length;
      aoa.push(headerRow1);
      const kbHeaderRow2 = aoa.length;
      aoa.push(['Time Slot', ...rangeDates.map(wd => wd.dayName)]);
      const kbDataStartRow = aoa.length;
      kickboxingRows.forEach(r => aoa.push(r));
      const kbEndRow = aoa.length - 1;

      aoa.push([]);
      aoa.push([]);

      const physioTitleRow = aoa.length;
      aoa.push(['Physio', ...Array(rangeDates.length).fill('')]);
      const physioHeaderRow1 = aoa.length;
      aoa.push(headerRow1);
      const physioHeaderRow2 = aoa.length;
      aoa.push(['Time Slot', ...rangeDates.map(wd => wd.dayName)]);
      const physioDataStartRow = aoa.length;
      physioRows.forEach(r => aoa.push(r));
      const physioEndRow = aoa.length - 1;

      aoa.push([]);
      aoa.push([]);

      const cryoStartRow = aoa.length;
      const cryoHeaderRow1 = aoa.length;
      aoa.push(['Cryotherapy', ...rangeDates.map(wd => {
        const dObj = new Date(wd.dateStr);
        const dayNum = wd.dateStr.split('-')[2];
        const monthName = dObj.toLocaleString('en-US', { month: 'long' });
        return `${dayNum} ${monthName}`;
      })]);
      const cryoHeaderRow2 = aoa.length;
      aoa.push(['', ...rangeDates.map(wd => wd.dayName)]);
      const cryoDataStartRow = aoa.length;
      cryoDataRows.forEach(r => aoa.push(r));
      const cryoEndRow = aoa.length - 1;

      aoa.push([]);
      aoa.push([]);

      const yogaStartRow = aoa.length;
      const yogaHeaderRow1 = aoa.length;
      aoa.push(['Yoga\n(7 AM to 8 AM)', ...rangeDates.map(wd => {
        const dObj = new Date(wd.dateStr);
        const dayNum = wd.dateStr.split('-')[2];
        const monthName = dObj.toLocaleString('en-US', { month: 'long' });
        return `${dayNum} ${monthName}`;
      })]);
      const yogaHeaderRow2 = aoa.length;
      aoa.push(['', ...rangeDates.map(wd => wd.dayName)]);
      const yogaDataStartRow = aoa.length;
      yogaDataRows.forEach(r => aoa.push(r));
      const yogaEndRow = aoa.length - 1;

      const utils = XLSX.utils;
      const write = XLSX.write;
      const worksheet = utils.aoa_to_sheet(aoa);

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: rangeDates.length } },
        { s: { r: pilatesTitleRow, c: 0 }, e: { r: pilatesTitleRow, c: rangeDates.length } },
        { s: { r: kbTitleRow, c: 0 }, e: { r: kbTitleRow, c: rangeDates.length } },
        { s: { r: physioTitleRow, c: 0 }, e: { r: physioTitleRow, c: rangeDates.length } },
        { s: { r: cryoStartRow, c: 0 }, e: { r: cryoEndRow, c: 0 } },
        { s: { r: yogaStartRow, c: 0 }, e: { r: yogaEndRow, c: 0 } }
      ];

      const range = utils.decode_range(worksheet['!ref'] || 'A1:A1');
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = utils.encode_cell({ r, c });
          const cell = worksheet[cellAddress];
          if (!cell) continue;

          if (r === 0) {
            cell.s = {
              font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '5C4A3F' } },
              fill: { fgColor: { rgb: 'F5ECE5' } },
              alignment: { vertical: 'center', horizontal: 'center', wrapText: true }
            };
            continue;
          }

          if (r === 1) {
            cell.s = {
              font: { name: 'Arial', sz: 9 },
              alignment: { vertical: 'center', horizontal: 'center' }
            };
            continue;
          }

          cell.s = {
            font: { name: 'Arial', sz: 9 },
            alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
            border: {
              top: { style: 'thin', color: { rgb: 'EADFD5' } },
              bottom: { style: 'thin', color: { rgb: 'EADFD5' } },
              left: { style: 'thin', color: { rgb: 'EADFD5' } },
              right: { style: 'thin', color: { rgb: 'EADFD5' } }
            }
          };

          const isSectionTitle = r === pilatesTitleRow || r === kbTitleRow || r === physioTitleRow;
          if (isSectionTitle) {
            cell.s.font = { name: 'Arial', sz: 12, bold: true, color: { rgb: '5C4A3F' } };
            cell.s.fill = { fgColor: { rgb: 'F5ECE5' } };
            continue;
          }

          const isSideTitle = c === 0 && ((r >= cryoStartRow && r <= cryoEndRow) || (r >= yogaStartRow && r <= yogaEndRow));
          if (isSideTitle) {
            cell.s.font = { name: 'Arial', sz: 11, bold: true, color: { rgb: '5C4A3F' } };
            cell.s.fill = { fgColor: { rgb: 'F5ECE5' } };
            cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true, textRotation: 90 };
            continue;
          }

          const isHeaderRow = 
            r === 2 || r === 3 || 
            r === pilatesHeaderRow1 || r === pilatesHeaderRow2 ||
            r === kbHeaderRow1 || r === kbHeaderRow2 ||
            r === physioHeaderRow1 || r === physioHeaderRow2 ||
            r === cryoHeaderRow1 || r === cryoHeaderRow2 ||
            r === yogaHeaderRow1 || r === yogaHeaderRow2;

          if (isHeaderRow) {
            const isSunday = c > 0 && rangeDates[c - 1]?.dayName === 'Sunday';
            cell.s.font = { name: 'Arial', sz: 9, bold: true, color: { rgb: 'FFFFFF' } };
            cell.s.fill = { fgColor: { rgb: isSunday ? 'B33939' : 'C97A46' } };
            cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
            cell.s.border = {
              top: { style: 'thin', color: { rgb: 'FFFFFF' } },
              bottom: { style: 'medium', color: { rgb: 'FFFFFF' } },
              left: { style: 'thin', color: { rgb: 'FFFFFF' } },
              right: { style: 'thin', color: { rgb: 'FFFFFF' } }
            };
            continue;
          }

          const val = String(cell.v || '');
          const isSundayCol = c > 0 && rangeDates[c - 1]?.dayName === 'Sunday';

          if (val === 'Leave') {
            cell.s.fill = { fgColor: { rgb: 'FDF0E6' } };
            cell.s.font = { name: 'Arial', sz: 9, bold: true, color: { rgb: 'D35400' } };
          } else if (val === 'Week off') {
            cell.s.fill = { fgColor: { rgb: 'FEF9E7' } };
            cell.s.font = { name: 'Arial', sz: 9, bold: true, color: { rgb: 'D4AC0D' } };
          } else if (val === 'Sunday' || (isSundayCol && val === '')) {
            cell.s.fill = { fgColor: { rgb: 'FDF2F2' } };
            cell.s.font = { name: 'Arial', sz: 9, bold: true, color: { rgb: 'B33939' } };
          } else if (val === 'No appointments') {
            cell.s.font = { name: 'Arial', sz: 9, color: { rgb: 'A39489' } };
          } else if (val !== '') {
            cell.s.font = { name: 'Arial', sz: 9, color: { rgb: '5C4A3F' } };
            if (val.includes('(Cancelled)') || val.includes('(cancelled)')) {
              cell.s.font.color = { rgb: 'A39489' };
            }
          }
        }
      }

      worksheet['!cols'] = [
        { wch: 22 },
        ...rangeDates.map(() => ({ wch: 28 }))
      ];

      const rowHeights = [];
      rowHeights.push({ hpt: 32 }); // Title row (r=0)
      rowHeights.push({ hpt: 15 }); // Spacer row (r=1)
      for (let r = 2; r <= range.e.r; r++) {
        const isHeader = r === 2 || r === 3 || r === pilatesHeaderRow1 || r === pilatesHeaderRow2 || r === kbHeaderRow1 || r === kbHeaderRow2 || r === physioHeaderRow1 || r === physioHeaderRow2 || r === cryoHeaderRow1 || r === cryoHeaderRow2 || r === yogaHeaderRow1 || r === yogaHeaderRow2;
        const isTitle = r === pilatesTitleRow || r === kbTitleRow || r === physioTitleRow;
        if (isTitle) rowHeights.push({ hpt: 24 });
        else if (isHeader) rowHeights.push({ hpt: 28 });
        else rowHeights.push({ hpt: 35 });
      }
      worksheet['!rows'] = rowHeights;

      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, 'Weekly Report');

      const u8array = write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([u8array], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

    } catch (err) {
      console.error("Weekly report export failed:", err);
      alert("Failed to export Weekly Report: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Get current date string in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Compute Metrics
  const activeMembersCount = useMemo(() => {
    return users.filter(u => !u.isBlocked).length;
  }, [users]);

  const bookingsToday = useMemo(() => {
    return bookings.filter(b => b.date === todayStr);
  }, [bookings, todayStr]);

  const bookingsTodayCount = bookingsToday.length;

  const pendingDuesTotal = useMemo(() => {
    return dues
      .filter(d => d.status === 'pending')
      .reduce((sum, d) => sum + Number(d.amount), 0);
  }, [dues]);

  const avgFeedbackRating = useMemo(() => {
    if (feedbacks.length === 0) return 5.0;
    const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
    return (sum / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  // Today's schedule list (sorted by time)
  const scheduleTodayList = useMemo(() => {
    return bookingsToday.filter(b => b.status !== 'cancelled');
  }, [bookingsToday]);

  // Upcoming bookings preview across all dates (excluding completed/cancelled)
  const upcomingBookingsList = useMemo(() => {
    const todayTimestamp = new Date(todayStr).getTime();
    return bookings
      .filter(b => {
        const bTime = new Date(b.date).getTime();
        return bTime >= todayTimestamp && b.status === 'confirmed';
      })
      .slice(0, 5);
  }, [bookings, todayStr]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <span className="label-spaced">SYSTEM OVERVIEW</span>
        <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Dashboard</h1>
        <p className="text-muted">Live performance details for THE ONE luxury club.</p>
      </div>

      {/* Bento Stats Grid */}
      <div className="bento-grid">
        <GlassCard hoverGlow>
          <div style={styles.cardHeader}>
            <span className="label-spaced" style={{ fontSize: '9px' }}>Active Athletes</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(201,122,70,0.1)', color: 'var(--color-accent)' }}>
              <FaUsers />
            </span>
          </div>
          <div style={styles.cardVal}>{activeMembersCount}</div>
          <div style={styles.cardFooter}>Out of {users.length} total users</div>
        </GlassCard>

        <GlassCard hoverGlow>
          <div style={styles.cardHeader}>
            <span className="label-spaced" style={{ fontSize: '9px' }}>Bookings Today</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(107,158,118,0.1)', color: 'var(--color-success)' }}>
              <FaCalendarCheck />
            </span>
          </div>
          <div style={styles.cardVal}>{bookingsTodayCount}</div>
          <div style={styles.cardFooter}>
            {bookingsToday.filter(b => b.status === 'completed').length} completed today
          </div>
        </GlassCard>

        <GlassCard hoverGlow>
          <div style={styles.cardHeader}>
            <span className="label-spaced" style={{ fontSize: '9px' }}>Pending Ledger</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(244,188,114,0.1)', color: 'var(--color-warning)' }}>
              <FaHourglassHalf />
            </span>
          </div>
          <div style={styles.cardVal}>₹{pendingDuesTotal.toLocaleString()}</div>
          <div style={styles.cardFooter}>
            {dues.filter(d => d.status === 'pending').length} unpaid accounts
          </div>
        </GlassCard>

        <GlassCard hoverGlow>
          <div style={styles.cardHeader}>
            <span className="label-spaced" style={{ fontSize: '9px' }}>Guest Rating</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(217,164,92,0.1)', color: 'var(--color-gold)' }}>
              <FaStar />
            </span>
          </div>
          <div style={styles.cardVal}>{avgFeedbackRating} <span style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>/ 5</span></div>
          <div style={styles.cardFooter}>From {feedbacks.length} guest reviews</div>
        </GlassCard>
      </div>

      {/* Main Grid Workspace */}
      <div className="grid-2col">
        {/* Schedule */}
        <GlassCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="title-card" style={{ fontStyle: 'italic' }}>Today's Active Schedule</h2>
            <Link to="/bookings" className="btn-secondary" style={{ padding: '0.4rem 1.0rem', fontSize: '10px' }} onClick={playClickSound}>
              View All
            </Link>
          </div>

          {scheduleTodayList.length === 0 ? (
            <div style={styles.emptyBox}>
              <p className="text-muted">No scheduled sessions for today.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="luxury-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Athlete</th>
                    <th>Service</th>
                    <th>Staff / Info</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleTodayList.map((booking) => (
                    <tr key={booking.id}>
                      <td style={{ fontWeight: 600 }}>{booking.time}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{booking.userName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          {booking.membershipType}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-accent)', fontSize: '13px', fontWeight: 500 }}>
                          {booking.serviceName}
                        </span>
                        {booking.subService && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{booking.subService}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {booking.therapistName || booking.trainerName || 'Unassigned'}
                        {booking.steamSaunaIncluded && (
                          <div style={{ fontSize: '10px', color: 'var(--color-gold)' }}>+ Steam & Sauna</div>
                        )}
                      </td>
                      <td>
                        <span className={`badge-status ${booking.status}`}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Attention Panel / Next Up */}
        <GlassCard>
          <h2 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>Action Required</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem' }}>
            {/* Pending Dues Alert */}
            {dues.filter(d => d.status === 'pending').slice(0, 3).map((due) => (
              <div key={due.id} style={styles.actionItem}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>₹{due.amount} Unpaid</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {due.userName} — {due.serviceName}
                  </div>
                </div>
                <Link to="/payments" className="btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '9px', border: '1px solid var(--color-accent)' }} onClick={playClickSound}>
                  Collect
                </Link>
              </div>
            ))}

            {/* Upcoming confirmed bookings */}
            {upcomingBookingsList.length > 0 && (
              <div style={{ marginTop: '1.0rem' }}>
                <span className="label-spaced" style={{ display: 'block', marginBottom: '0.75rem' }}>Upcoming Sessions</span>
                {upcomingBookingsList.map((b) => (
                  <div key={b.id} style={{ ...styles.actionItem, borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.75rem', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{b.userName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        {b.date} @ {b.time} — {b.serviceName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Export & Reports Section */}
      <div style={{ marginTop: '2.0rem' }}>
        <GlassCard>
          <h2 className="title-card" style={{ fontStyle: 'italic', marginBottom: '1.5rem' }}>
            Club Reports & Excel Export
          </h2>
          
          <div style={styles.exportGrid}>
            <div style={styles.exportField}>
              <label className="label-spaced" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Report Category
              </label>
              <select
                style={styles.selectLuxury}
                value={exportType}
                onChange={(e) => setExportType(e.target.value as any)}
              >
                <option value="bookings">Bookings Schedule</option>
                <option value="members">Athletes Directory (Reg. Date)</option>
                <option value="payments">Ledger Payments & Dues</option>
              </select>
            </div>

            <div style={styles.exportField}>
              <label className="label-spaced" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Start Date
              </label>
              <input
                type="date"
                style={styles.dateInputLuxury}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div style={styles.exportField}>
              <label className="label-spaced" style={{ display: 'block', marginBottom: '0.5rem' }}>
                End Date
              </label>
              <input
                type="date"
                style={styles.dateInputLuxury}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div style={{ ...styles.exportField, display: 'flex', alignItems: 'flex-end', flexDirection: 'row', gap: '8px', flex: '1 1 300px' }}>
              <button
                type="button"
                onClick={(e) => { playClickSound(); handleExportExcel(e); }}
                className="btn-hero"
                style={{ flex: 1, height: '38px', borderRadius: '4px', fontSize: '11px', letterSpacing: '0.1em' }}
              >
                Download Excel
              </button>
              <button
                type="button"
                onClick={(e) => { playClickSound(); handleExportWeeklyReport(e); }}
                style={{
                  flex: 1,
                  height: '38px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#C97A46',
                  cursor: 'pointer',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Weekly Report
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

const styles = {
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.0rem',
  },
  iconBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  cardVal: {
    fontSize: '2.5rem',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    marginBottom: '0.25rem',
    color: 'var(--color-text-primary)',
  },
  cardFooter: {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
  },
  emptyBox: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '4rem 1rem',
    border: '1px dashed var(--color-border)',
    borderRadius: '4px',
  },
  actionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
  },
  exportGrid: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap' as const,
    alignItems: 'stretch',
  },
  exportField: {
    flex: '1 1 200px',
    minWidth: '150px',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-end',
  },
  selectLuxury: {
    width: '100%',
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.5rem 0.75rem',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    cursor: 'pointer',
    height: '38px',
  },
  dateInputLuxury: {
    width: '100%',
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.5rem 0.75rem',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    cursor: 'pointer',
    colorScheme: 'dark',
    height: '38px',
  },
};

export default Dashboard;
