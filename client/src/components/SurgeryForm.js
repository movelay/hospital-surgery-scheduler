import React, { useState, useEffect, Suspense, lazy } from 'react';
import { surgeryAPI, userAPI } from '../services/api';
import { localDateString } from '../utils/date';
import '../styles/SurgeryForm.css';

const TimeSlotVisualizer = lazy(() => import('./TimeSlotVisualizer'));

const SurgeryForm = ({ surgery, onClose, onSuccess, isAdmin = false }) => {
  const [formData, setFormData] = useState({
    doctor_id: '',
    patient_name: '',
    surgery_type: '',
    surgery_date: localDateString(),
    start_time: '',
    end_time: '',
    operating_room: '',
    notes: '',
    status: 'scheduled'
  });
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVisualizer, setShowVisualizer] = useState(false);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    userAPI.getDoctors()
      .then((response) => {
        if (!cancelled) setDoctors(response.data);
      })
      .catch((loadError) => {
        console.error('加载医生列表失败:', loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!surgery) return;
    setFormData({
      doctor_id: surgery.doctor_id ? surgery.doctor_id.toString() : '',
      patient_name: surgery.patient_name || '',
      surgery_type: surgery.surgery_type || '',
      surgery_date: surgery.surgery_date || localDateString(),
      start_time: surgery.start_time || '',
      end_time: surgery.end_time || '',
      operating_room: surgery.operating_room || '',
      notes: surgery.notes || '',
      status: surgery.status || 'scheduled'
    });
  }, [surgery]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTimeChange = (startTime, endTime) => {
    setFormData(prev => ({ 
      ...prev, 
      start_time: startTime, 
      end_time: endTime 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        patient_name: formData.patient_name,
        surgery_type: formData.surgery_type,
        surgery_date: formData.surgery_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        operating_room: formData.operating_room,
        notes: formData.notes
      };
      if (isAdmin) {
        payload.doctor_id = formData.doctor_id;
        payload.status = formData.status;
      }
      if (surgery) {
        await surgeryAPI.update(surgery.id, payload);
      } else {
        await surgeryAPI.create(payload);
      }
      onSuccess();
    } catch (error) {
      setError(error.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{surgery ? '编辑手术' : '新增手术'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="surgery-form">
          {isAdmin && (
            <div className="form-group">
              <label>医生 *</label>
              <select
                name="doctor_id"
                value={formData.doctor_id}
                onChange={handleChange}
                required
              >
                <option value="">请选择医生</option>
                {doctors.map(doctor => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>病人姓名 *</label>
              <input
                type="text"
                name="patient_name"
                value={formData.patient_name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>手术项目 *</label>
              <input
                type="text"
                name="surgery_type"
                value={formData.surgery_type}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>手术日期 *</label>
              <input
                type="date"
                name="surgery_date"
                value={formData.surgery_date}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>手术室 *</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  name="operating_room"
                  value={formData.operating_room}
                  placeholder="例如：1号手术室"
                  onChange={handleChange}
                  required
                  style={{ flex: 1 }}
                />
                {formData.operating_room && formData.surgery_date && (
                  <button
                    type="button"
                    onClick={() => setShowVisualizer(!showVisualizer)}
                    className="visualizer-toggle-button"
                    title={showVisualizer ? "隐藏时间可视化" : "显示时间可视化"}
                  >
                    {showVisualizer ? '📊 隐藏时间表' : '📊 查看时间表'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {showVisualizer && formData.operating_room && formData.surgery_date && (
            <Suspense fallback={<div className="loading-text">时间表加载中...</div>}>
              <TimeSlotVisualizer
                operatingRoom={formData.operating_room}
                surgeryDate={formData.surgery_date}
                startTime={formData.start_time}
                endTime={formData.end_time}
                onTimeChange={handleTimeChange}
                excludeSurgeryId={surgery?.id}
              />
            </Suspense>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>开始时间 *</label>
              <input
                type="time"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>结束时间 *</label>
              <input
                type="time"
                name="end_time"
                value={formData.end_time}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {isAdmin && (
            <div className="form-group">
              <label>状态</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="scheduled">已安排</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label>备注</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              取消
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SurgeryForm;
