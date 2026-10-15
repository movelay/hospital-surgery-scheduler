import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { surgeryAPI, isCanceled } from '../services/api';
import { addDays, formatMonthDay } from '../utils/date';
import '../styles/TimeSlotVisualizer.css';

const HOURS = 24;
const HOUR_HEIGHT = 40;
const DATE_WIDTH = 200;
const DAYS_TO_SHOW = 7;

function timeToHour(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + minutes / 60;
}

function hourToTime(hour) {
  const totalMinutes = Math.max(0, Math.min(HOURS * 60 - 1, Math.round(hour * 60)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function rangesOverlap(startHour, endHour, surgery) {
  return startHour < surgery.endHour && endHour > surgery.startHour;
}

function drawBoard(ctx, visibleDates, width, height, byDate, hoveredId, selectedDate) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  for (let hour = 0; hour <= HOURS; hour++) {
    const y = hour * HOUR_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (let index = 0; index <= visibleDates.length; index++) {
    const x = index * DATE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.fillStyle = '#666';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  for (let hour = 0; hour < HOURS; hour++) {
    const y = hour * HOUR_HEIGHT + HOUR_HEIGHT / 2;
    ctx.fillText(`${String(hour).padStart(2, '0')}:00`, DATE_WIDTH - 10, y + 4);
  }

  ctx.textAlign = 'center';
  visibleDates.forEach((date, index) => {
    const x = index * DATE_WIDTH + DATE_WIDTH / 2;
    const isSelected = date === selectedDate;
    ctx.fillStyle = isSelected ? '#007bff' : '#333';
    ctx.font = isSelected ? 'bold 14px Arial' : '14px Arial';
    ctx.fillText(formatMonthDay(date), x, 20);
  });

  visibleDates.forEach((date, dateIndex) => {
    const daySurgeries = byDate.get(date) || [];
    daySurgeries.forEach(surgery => {
      const x = dateIndex * DATE_WIDTH + 5;
      const y = surgery.startHour * HOUR_HEIGHT;
      const blockHeight = (surgery.endHour - surgery.startHour) * HOUR_HEIGHT;
      const isHovered = hoveredId === surgery.id;

      ctx.fillStyle = isHovered ? '#ff6b6b' : '#ffa8a8';
      ctx.fillRect(x, y, DATE_WIDTH - 10, blockHeight);
      ctx.strokeStyle = isHovered ? '#ff4757' : '#ff8787';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.strokeRect(x, y, DATE_WIDTH - 10, blockHeight);

      ctx.fillStyle = '#fff';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(surgery.patient_name, x + 5, y + 15);
      ctx.fillText(`${surgery.start_time}-${surgery.end_time}`, x + 5, y + 28);
    });
  });
}

function drawSelection(ctx, visibleDates, byDate, selectedDate, selected) {
  if (selected.start === null || selected.end === null) return;
  const dateIndex = visibleDates.indexOf(selectedDate);
  if (dateIndex < 0) return;

  const x = dateIndex * DATE_WIDTH + 5;
  const y = selected.start * HOUR_HEIGHT;
  const blockHeight = (selected.end - selected.start) * HOUR_HEIGHT;
  const daySurgeries = byDate.get(selectedDate) || [];
  const hasConflict = daySurgeries.some(surgery => rangesOverlap(selected.start, selected.end, surgery));

  ctx.fillStyle = hasConflict ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 123, 255, 0.3)';
  ctx.fillRect(x, y, DATE_WIDTH - 10, blockHeight);
  ctx.strokeStyle = hasConflict ? '#ff0000' : '#007bff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, DATE_WIDTH - 10, blockHeight);

  ctx.fillStyle = hasConflict ? '#ff0000' : '#007bff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${hourToTime(selected.start)} - ${hourToTime(selected.end)}`, x + 5, y - 5);
  if (hasConflict) ctx.fillText('⚠️ 时间冲突', x + 5, y + blockHeight + 15);
}

const TimeSlotVisualizer = ({
  operatingRoom,
  surgeryDate,
  startTime,
  endTime,
  onTimeChange,
  excludeSurgeryId = null
}) => {
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSurgery, setHoveredSurgery] = useState(null);
  const [selection, setSelection] = useState({ start: null, end: null });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const selectionRef = useRef({ start: null, end: null });
  const dragOriginRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const rafRef = useRef(0);
  const datesRef = useRef([]);
  const byDateRef = useRef(new Map());
  const surgeryDateRef = useRef(surgeryDate);

  const dates = useMemo(() => {
    if (!surgeryDate) return [];
    return Array.from({ length: DAYS_TO_SHOW }, (_, index) => addDays(surgeryDate, index));
  }, [surgeryDate]);

  const surgeriesByDate = useMemo(() => {
    const map = new Map();
    surgeries.forEach(surgery => {
      const enriched = {
        ...surgery,
        startHour: timeToHour(surgery.start_time),
        endHour: timeToHour(surgery.end_time)
      };
      const list = map.get(surgery.surgery_date);
      if (list) list.push(enriched);
      else map.set(surgery.surgery_date, [enriched]);
    });
    return map;
  }, [surgeries]);

  const dataVersionRef = useRef(0);
  const dataSnapshotRef = useRef({ surgeries, surgeryDate });
  if (dataSnapshotRef.current.surgeries !== surgeries || dataSnapshotRef.current.surgeryDate !== surgeryDate) {
    dataSnapshotRef.current = { surgeries, surgeryDate };
    dataVersionRef.current += 1;
  }
  const staticLayerRef = useRef({ canvas: null, key: '' });

  datesRef.current = dates;
  byDateRef.current = surgeriesByDate;
  surgeryDateRef.current = surgeryDate;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const visibleDates = datesRef.current;
    if (!canvas || visibleDates.length === 0) return;

    const width = visibleDates.length * DATE_WIDTH;
    const height = HOURS * HOUR_HEIGHT;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const layerKey = `${width}x${height}|${dataVersionRef.current}|${hoveredIdRef.current}|${visibleDates.join(',')}`;
    let layer = staticLayerRef.current.canvas;
    if (!layer) {
      layer = document.createElement('canvas');
      staticLayerRef.current.canvas = layer;
    }
    if (staticLayerRef.current.key !== layerKey) {
      if (layer.width !== width || layer.height !== height) {
        layer.width = width;
        layer.height = height;
      }
      drawBoard(
        layer.getContext('2d'),
        visibleDates,
        width,
        height,
        byDateRef.current,
        hoveredIdRef.current,
        surgeryDateRef.current
      );
      staticLayerRef.current.key = layerKey;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(layer, 0, 0);
    drawSelection(ctx, visibleDates, byDateRef.current, surgeryDateRef.current, selectionRef.current);
  }, []);

  useEffect(() => {
    if (!operatingRoom || !surgeryDate) return undefined;
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await surgeryAPI.getAll(
          null,
          null,
          operatingRoom,
          true,
          surgeryDate,
          addDays(surgeryDate, DAYS_TO_SHOW - 1),
          controller.signal
        );
        if (!active) return;
        setSurgeries(response.data.filter(surgery => (
          surgery.id !== excludeSurgeryId && surgery.status !== 'cancelled'
        )));
      } catch (error) {
        if (!active || isCanceled(error)) return;
        console.error('获取手术数据失败:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [operatingRoom, surgeryDate, excludeSurgeryId]);

  useEffect(() => {
    if (!startTime || !endTime) return;
    const next = { start: timeToHour(startTime), end: timeToHour(endTime) };
    selectionRef.current = next;
    setSelection(next);
    paint();
  }, [startTime, endTime, paint]);

  useEffect(() => {
    paint();
  }, [surgeries, hoveredSurgery, surgeryDate, paint]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    tooltip.style.left = `${pointerRef.current.x + 10}px`;
    tooltip.style.top = `${pointerRef.current.y + 10}px`;
  });

  const pointerToSlot = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const hour = Math.max(0, Math.min(HOURS, y / HOUR_HEIGHT));
    const dateIndex = Math.floor(x / DATE_WIDTH);
    const date = datesRef.current[dateIndex] || surgeryDateRef.current;
    return { hour, date };
  };

  const surgeryAt = (date, hour) => {
    const daySurgeries = byDateRef.current.get(date) || [];
    return daySurgeries.find(surgery => hour >= surgery.startHour && hour <= surgery.endHour) || null;
  };

  const scheduleSelection = (next) => {
    selectionRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
      setSelection(selectionRef.current);
    });
  };

  const handleMouseDown = (event) => {
    const { hour, date } = pointerToSlot(event);
    if (date !== surgeryDateRef.current) return;
    dragOriginRef.current = hour;
    const next = { start: hour, end: hour };
    selectionRef.current = next;
    setSelection(next);
    paint();
  };

  const handleMouseMove = (event) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    const tooltip = tooltipRef.current;
    if (tooltip) {
      tooltip.style.left = `${event.clientX + 10}px`;
      tooltip.style.top = `${event.clientY + 10}px`;
    }

    const { hour, date } = pointerToSlot(event);
    const surgery = surgeryAt(date, hour);
    const nextId = surgery ? surgery.id : null;
    if (nextId !== hoveredIdRef.current) {
      hoveredIdRef.current = nextId;
      setHoveredSurgery(surgery);
    }

    if (dragOriginRef.current !== null && date === surgeryDateRef.current) {
      const origin = dragOriginRef.current;
      scheduleSelection({
        start: Math.min(origin, hour),
        end: Math.max(origin, hour)
      });
    }
  };

  const handleMouseUp = () => {
    if (dragOriginRef.current === null) return;
    dragOriginRef.current = null;
    const selected = selectionRef.current;
    if (selected.start === null || selected.end === null || !onTimeChange) return;
    const startText = hourToTime(selected.start);
    const endText = hourToTime(selected.end);
    if (startText < endText) onTimeChange(startText, endText);
  };

  const handleMouseLeave = () => {
    hoveredIdRef.current = null;
    setHoveredSurgery(null);
  };

  if (!operatingRoom || !surgeryDate) {
    return (
      <div className="time-slot-visualizer">
        <div className="visualizer-placeholder">
          请先选择手术室和日期
        </div>
      </div>
    );
  }

  const daySurgeries = surgeriesByDate.get(surgeryDate) || [];
  const hasConflict = selection.start !== null
    && selection.end !== null
    && daySurgeries.some(surgery => rangesOverlap(selection.start, selection.end, surgery));

  return (
    <div className="time-slot-visualizer">
      <div className="visualizer-header">
        <h3>手术室时间占用情况: {operatingRoom}</h3>
        {loading && <span className="loading-text">加载中...</span>}
      </div>

      <div className="visualizer-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="time-slot-canvas"
        />
      </div>

      {hoveredSurgery && (
        <div
          ref={tooltipRef}
          className="surgery-tooltip"
          style={{ position: 'fixed', zIndex: 10000 }}
        >
          <div className="tooltip-title">已占用时间段</div>
          <div><strong>患者:</strong> {hoveredSurgery.patient_name}</div>
          <div><strong>医生:</strong> {hoveredSurgery.doctor_name}</div>
          <div><strong>手术项目:</strong> {hoveredSurgery.surgery_type}</div>
          <div><strong>时间:</strong> {hoveredSurgery.start_time} - {hoveredSurgery.end_time}</div>
          <div><strong>日期:</strong> {hoveredSurgery.surgery_date}</div>
        </div>
      )}

      {selection.start !== null && selection.end !== null && (
        <div className="selected-time-info">
          <div>
            <strong>选择的时间:</strong> {hourToTime(selection.start)} - {hourToTime(selection.end)}
          </div>
          {hasConflict && (
            <div className="conflict-warning">
              ⚠️ 该时间段与已有手术冲突，请调整时间
            </div>
          )}
        </div>
      )}

      <div className="visualizer-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ffa8a8' }}></div>
          <span>已占用时间段</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: 'rgba(0, 123, 255, 0.3)' }}></div>
          <span>选择的时间段</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: 'rgba(255, 0, 0, 0.3)' }}></div>
          <span>冲突时间段</span>
        </div>
        <div className="legend-hint">💡 提示: 在时间轴上拖拽鼠标选择时间段</div>
      </div>
    </div>
  );
};

export default TimeSlotVisualizer;
