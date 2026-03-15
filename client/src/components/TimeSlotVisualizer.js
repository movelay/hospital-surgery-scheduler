import React, { useState, useEffect, useRef } from 'react';
import { surgeryAPI } from '../services/api';
import '../styles/TimeSlotVisualizer.css';

const TimeSlotVisualizer = ({ 
  operatingRoom, 
  surgeryDate, 
  startTime, 
  endTime, 
  onTimeChange,
  excludeSurgeryId = null // 编辑时排除当前手术
}) => {
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSurgery, setHoveredSurgery] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedEnd, setSelectedEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const HOURS = 24;
  const HOUR_HEIGHT = 40; // 每个小时的高度（像素）
  const DATE_WIDTH = 200; // 每个日期的宽度
  const DAYS_TO_SHOW = 7; // 显示7天

  useEffect(() => {
    if (operatingRoom && surgeryDate) {
      fetchSurgeries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatingRoom, surgeryDate]);

  useEffect(() => {
    if (startTime && endTime) {
      const startHour = timeToHour(startTime);
      const endHour = timeToHour(endTime);
      setSelectedStart(startHour);
      setSelectedEnd(endHour);
    }
  }, [startTime, endTime]);

  useEffect(() => {
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surgeries, selectedStart, selectedEnd, hoveredSurgery]);

  const fetchSurgeries = async () => {
    if (!operatingRoom) return;
    
    setLoading(true);
    try {
      // 获取未来7天的数据
      const startDate = new Date(surgeryDate);
      const allSurgeries = [];
      
      for (let i = 0; i < DAYS_TO_SHOW; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
          // 必须拉取该手术室全部手术（view_all=true），否则医生只能看到自己的，无法正确显示占用与冲突
          const response = await surgeryAPI.getAll(dateStr, null, operatingRoom, true);
          const daySurgeries = response.data.filter(s => 
            s.operating_room === operatingRoom && 
            s.id !== excludeSurgeryId
          );
          allSurgeries.push(...daySurgeries);
        } catch (error) {
          console.error(`获取 ${dateStr} 的数据失败:`, error);
        }
      }
      
      setSurgeries(allSurgeries);
    } catch (error) {
      console.error('获取手术数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const timeToHour = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  };

  const hourToTime = (hour) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const getDateRange = () => {
    const dates = [];
    const startDate = new Date(surgeryDate);
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const getSurgeriesForDate = (date) => {
    return surgeries.filter(s => s.surgery_date === date);
  };

  const checkConflict = (startHour, endHour, date) => {
    const daySurgeries = getSurgeriesForDate(date);
    return daySurgeries.some(surgery => {
      const sStart = timeToHour(surgery.start_time);
      const sEnd = timeToHour(surgery.end_time);
      // 检查是否有重叠
      return (startHour < sEnd && endHour > sStart);
    });
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dates = getDateRange();
    const width = dates.length * DATE_WIDTH;
    const height = HOURS * HOUR_HEIGHT;

    canvas.width = width;
    canvas.height = height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // 绘制小时线
    for (let h = 0; h <= HOURS; h++) {
      const y = h * HOUR_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 绘制日期线
    for (let i = 0; i <= dates.length; i++) {
      const x = i * DATE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 绘制小时标签
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    for (let h = 0; h < HOURS; h++) {
      const y = h * HOUR_HEIGHT + HOUR_HEIGHT / 2;
      ctx.fillText(`${String(h).padStart(2, '0')}:00`, DATE_WIDTH - 10, y + 4);
    }

    // 绘制日期标签
    ctx.textAlign = 'center';
    dates.forEach((date, index) => {
      const x = index * DATE_WIDTH + DATE_WIDTH / 2;
      const dateObj = new Date(date);
      const isToday = date === surgeryDate;
      
      ctx.fillStyle = isToday ? '#007bff' : '#333';
      ctx.font = isToday ? 'bold 14px Arial' : '14px Arial';
      ctx.fillText(
        `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
        x,
        20
      );
    });

    // 绘制已占用的时间段
    dates.forEach((date, dateIndex) => {
      const daySurgeries = getSurgeriesForDate(date);
      daySurgeries.forEach(surgery => {
        const startHour = timeToHour(surgery.start_time);
        const endHour = timeToHour(surgery.end_time);
        const x = dateIndex * DATE_WIDTH + 5;
        const y = startHour * HOUR_HEIGHT;
        const h = (endHour - startHour) * HOUR_HEIGHT;

        // 检查是否是悬浮的手术
        const isHovered = hoveredSurgery?.id === surgery.id;

        ctx.fillStyle = isHovered ? '#ff6b6b' : '#ffa8a8';
        ctx.fillRect(x, y, DATE_WIDTH - 10, h);

        // 绘制边框
        ctx.strokeStyle = isHovered ? '#ff4757' : '#ff8787';
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.strokeRect(x, y, DATE_WIDTH - 10, h);

        // 绘制文字
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(
          `${surgery.patient_name}`,
          x + 5,
          y + 15
        );
        ctx.fillText(
          `${surgery.start_time}-${surgery.end_time}`,
          x + 5,
          y + 28
        );
      });
    });

    // 绘制选中的时间段（如果有）
    if (selectedStart !== null && selectedEnd !== null) {
      const dateIndex = dates.indexOf(surgeryDate);
      if (dateIndex >= 0) {
        const x = dateIndex * DATE_WIDTH + 5;
        const y = selectedStart * HOUR_HEIGHT;
        const h = (selectedEnd - selectedStart) * HOUR_HEIGHT;

        // 检查冲突
        const hasConflict = checkConflict(selectedStart, selectedEnd, surgeryDate);

        ctx.fillStyle = hasConflict ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 123, 255, 0.3)';
        ctx.fillRect(x, y, DATE_WIDTH - 10, h);

        ctx.strokeStyle = hasConflict ? '#ff0000' : '#007bff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, DATE_WIDTH - 10, h);

        // 绘制时间标签
        ctx.fillStyle = hasConflict ? '#ff0000' : '#007bff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(
          `${hourToTime(selectedStart)} - ${hourToTime(selectedEnd)}`,
          x + 5,
          y - 5
        );

        if (hasConflict) {
          ctx.fillText('⚠️ 时间冲突', x + 5, y + h + 15);
        }
      }
    }
  };

  const getYFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(0, Math.min(HOURS, y / HOUR_HEIGHT));
  };

  const getDateFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dateIndex = Math.floor(x / DATE_WIDTH);
    const dates = getDateRange();
    return dates[dateIndex] || surgeryDate;
  };

  const handleMouseDown = (e) => {
    const hour = getYFromEvent(e);
    const date = getDateFromEvent(e);
    
    if (date === surgeryDate) {
      setIsDragging(true);
      setDragStartY(hour);
      setSelectedStart(hour);
      setSelectedEnd(hour);
    }
  };

  const handleMouseMove = (e) => {
    const hour = getYFromEvent(e);
    const date = getDateFromEvent(e);
    
    // 更新鼠标位置用于 tooltip 定位
    setHoverPosition({ x: e.clientX, y: e.clientY });

    // 检查鼠标是否在某个手术上
    const dates = getDateRange();
    const dateIndex = dates.indexOf(date);
    if (dateIndex >= 0) {
      const daySurgeries = getSurgeriesForDate(date);
      let found = false;
      
      for (const surgery of daySurgeries) {
        const sStart = timeToHour(surgery.start_time);
        const sEnd = timeToHour(surgery.end_time);
        if (hour >= sStart && hour <= sEnd) {
          setHoveredSurgery(surgery);
          found = true;
          break;
        }
      }
      
      if (!found) {
        setHoveredSurgery(null);
      }
    }

    // 处理拖拽
    if (isDragging && date === surgeryDate) {
      if (hour >= dragStartY) {
        setSelectedStart(dragStartY);
        setSelectedEnd(hour);
      } else {
        setSelectedStart(hour);
        setSelectedEnd(dragStartY);
      }
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selectedStart !== null && selectedEnd !== null) {
      const startTimeStr = hourToTime(selectedStart);
      const endTimeStr = hourToTime(selectedEnd);
      
      if (onTimeChange) {
        onTimeChange(startTimeStr, endTimeStr);
      }
    }
    setIsDragging(false);
    setDragStartY(null);
  };

  const handleMouseLeave = () => {
    setHoveredSurgery(null);
    if (!isDragging) {
      setIsDragging(false);
    }
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
          className="surgery-tooltip"
          style={{
            position: 'fixed',
            left: `${hoverPosition.x + 10}px`,
            top: `${hoverPosition.y + 10}px`,
            zIndex: 10000
          }}
        >
          <div className="tooltip-title">已占用时间段</div>
          <div><strong>患者:</strong> {hoveredSurgery.patient_name}</div>
          <div><strong>医生:</strong> {hoveredSurgery.doctor_name}</div>
          <div><strong>手术项目:</strong> {hoveredSurgery.surgery_type}</div>
          <div><strong>时间:</strong> {hoveredSurgery.start_time} - {hoveredSurgery.end_time}</div>
          <div><strong>日期:</strong> {hoveredSurgery.surgery_date}</div>
        </div>
      )}

      {selectedStart !== null && selectedEnd !== null && (
        <div className="selected-time-info">
          <div>
            <strong>选择的时间:</strong> {hourToTime(selectedStart)} - {hourToTime(selectedEnd)}
          </div>
          {checkConflict(selectedStart, selectedEnd, surgeryDate) && (
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
