import React, { useState, useEffect } from 'react';
import ModalTaskForm from '../ModalTaskForm';

function ColumnSettings({ allColumns, selected, onChange, onClose }) {
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',color:'#111',padding:32,borderRadius:8,minWidth:320}}>
        <h3>Налаштування колонок</h3>
        <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:400,overflowY:'auto'}}>
          {allColumns.map(col => (
            <label key={col.key} style={{fontWeight:600}}>
              <input type="checkbox" checked={selected.includes(col.key)} onChange={e => {
                if (e.target.checked) onChange([...selected, col.key]);
                else onChange(selected.filter(k => k !== col.key));
              }} /> {col.label}
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:12,marginTop:24}}>
          <button onClick={onClose} style={{flex:1}}>OK</button>
        </div>
      </div>
    </div>
  );
}

export default function TaskTable({
  tasks = [],
  allTasks = [],
  onApprove,
  onStatusChange,
  role = 'service',
  filters,
  onFilterChange,
  columns,
  approveField,
  commentField,
  statusOptions = ['Новий', 'В роботі', 'Виконано', 'Заблоковано'],
  onEdit,
  onDelete,
  dateRange,
  setDateRange,
  user,
}) {
  console.log('TaskTable props', {onApprove});
  const [showSettings, setShowSettings] = useState(false);
  const [infoTask, setInfoTask] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const storageKey = role + 'TableColumns';
  const allColumns = columns;
  const defaultKeys = columns.map(c => c.key);
  const [selected, setSelected] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
    return defaultKeys;
  });
  const visibleColumns = selected.map(key => allColumns.find(c => c.key === key)).filter(Boolean);
  const handleSettingsSave = (cols) => {
    setSelected(cols);
    localStorage.setItem(storageKey, JSON.stringify(cols));
    setShowSettings(false);
  };
  const [sortField, setSortField] = useState('requestDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filter, setFilter] = useState('');
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, comment: '' });
  const [editDateModal, setEditDateModal] = useState({ open: false, taskId: null, month: '', year: '' });

  const statusOrder = {
    'Новий': 1,
    'В роботі': 2,
    'Виконано': 3,
    'Заблоковано': 4,
  };
  const sortedTasks = [...tasks].sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

  // Додаю функцію для визначення кольору рядка
  function getRowColor(t) {
    // Перевіряємо, чи хтось відхилив заявку
    if (t.approvedByAccountant === 'Відмова' || t.approvedByWarehouse === 'Відмова' || t.approvedByRegionalManager === 'Відмова') {
      return '#ff9999'; // Більш насичений червоний колір для відхилених заявок
    }
    
    const acc = t.approvedByAccountant === true || t.approvedByAccountant === 'Підтверджено';
    const wh = t.approvedByWarehouse === true || t.approvedByWarehouse === 'Підтверджено';
    const reg = t.approvedByRegionalManager === true || t.approvedByRegionalManager === 'Підтверджено';
    
    if (acc && wh && reg) return 'linear-gradient(90deg, #ffb6e6 33%, #ffe066 33%, #66d9ff 66%)';
    if (acc && wh) return 'linear-gradient(90deg, #ffb6e6 50%, #ffe066 50%)';
    if (acc && reg) return 'linear-gradient(90deg, #ffb6e6 50%, #66d9ff 50%)';
    if (wh && reg) return 'linear-gradient(90deg, #ffe066 50%, #66d9ff 50%)';
    if (acc) return '#ffb6e6';
    if (wh) return '#ffe066';
    if (reg) return '#66d9ff';
    return '';
  }

  // Вибір історії по замовнику
  const getClientHistory = (client) => (allTasks.length ? allTasks : tasks).filter(t => t.client === client);

  // Модалка інформації
  function InfoModal({task, onClose, history}) {
    if (!task || !task.requestDate) return null;
    return (
      <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'#fff',color:'#111',padding:48,borderRadius:0,width:'100vw',height:'100vh',overflowY:'auto',fontSize:'1.15rem',boxSizing:'border-box',display:'flex',flexDirection:'column'}}>
          <h2 style={{marginTop:0,marginBottom:24}}>Історія проведення робіт по замовнику: {task.client}</h2>
          <div style={{flex:1,overflowY:'auto',background:'#f7f7fa',padding:16,borderRadius:8}}>
            {history.length === 0 ? <div>Історія відсутня</div> :
              <ul style={{margin:0,padding:0,listStyle:'none'}}>
                {history.map(h => (
                  <li key={h.id} style={{marginBottom:16,paddingBottom:16,borderBottom:'1px solid #eee'}}>
                    <b>Дата заявки:</b> {h.requestDate} <b>Статус:</b> {h.status}<br/>
                    <b>Найменування робіт:</b> {h.work}<br/>
                    <b>Дата проведення робіт:</b> {h.date}<br/>
                    <b>Регіон сервісного відділу:</b> {h.serviceRegion}<br/>
                    <b>Сервісний інженер №1:</b> {h.engineer1}<br/>
                    <b>Сервісний інженер №2:</b> {h.engineer2}<br/>
                    <b>Загальна сума послуги:</b> {h.serviceTotal}<br/>
                    <b>Вид оплати:</b> {h.paymentType}<br/>
                    <b>Номер рахунку:</b> {h.invoice}<br/>
                    <b>Адреса:</b> {h.address}<br/>
                    <b>Заводський номер обладнання:</b> {h.equipmentSerial}<br/>
                    <b>Тип обладнання:</b> {h.equipment}<br/>
                    <b>Опис:</b> {h.requestDesc}
                  </li>
                ))}
              </ul>
            }
          </div>
          <div style={{display:'flex',gap:12,marginTop:32}}>
            <button onClick={onClose} style={{flex:1,fontSize:'1.1rem',padding:'16px 0'}}>Закрити</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Додаю функцію для підтвердження відмови ---
  const handleRejectConfirm = () => {
    if (rejectModal.taskId && onApprove) {
      onApprove(rejectModal.taskId, 'Відмова', rejectModal.comment);
    }
    setRejectModal({ open: false, taskId: null, comment: '' });
  };
  const handleRejectCancel = () => {
    setRejectModal({ open: false, taskId: null, comment: '' });
  };

  // --- Drag and drop для колонок ---
  const userLogin = user?.login || 'default';
  const columnsOrderKey = `${role}_columnsOrder_${userLogin}`;

  useEffect(() => {
    const savedOrder = localStorage.getItem(columnsOrderKey);
    if (savedOrder) {
      const order = JSON.parse(savedOrder);
      // Перевіряємо, чи всі ключі є у columns
      if (Array.isArray(order) && order.every(k => columns.some(c => c.key === k))) {
        setSelected(order);
      }
    }
    // eslint-disable-next-line
  }, [columnsOrderKey, columns.length]);

  const handleDragStart = (e, idx) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('colIdx', idx);
  };
  const handleDrop = (e, idx) => {
    const fromIdx = +e.dataTransfer.getData('colIdx');
    if (fromIdx === idx) return;
    const newOrder = [...selected];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(idx, 0, removed);
    setSelected(newOrder);
    localStorage.setItem(columnsOrderKey, JSON.stringify(newOrder));
  };
  const handleDragOver = e => e.preventDefault();

  // --- ФУНКЦІЯ для збереження нової дати підтвердження ---
  const handleSaveBonusDate = () => {
    if (!editDateModal.taskId || !editDateModal.month || !editDateModal.year) return;
    const newDate = `${editDateModal.month.padStart(2, '0')}.${editDateModal.year}`;
    if (onEdit) {
      // Знаходимо завдання та викликаємо onEdit з оновленим полем bonusApprovalDate
      const task = tasks.find(t => t.id === editDateModal.taskId);
      if (task) {
        onEdit({ ...task, bonusApprovalDate: newDate });
      }
    }
    setEditDateModal({ open: false, taskId: null, month: '', year: '' });
  };

  // --- МАСИВИ для вибору місяця та року ---
  const months = [
    '01','02','03','04','05','06','07','08','09','10','11','12'
  ];
  const years = [];
  const now = new Date();
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(String(y));

  return (
    <>
      {/* Вкладки, фільтри, кнопки — окремий контейнер */}
      <div style={{marginBottom: 24}}>
        <button onClick={()=>setShowSettings(true)} style={{marginBottom:12}}>Налаштувати колонки</button>
        {showSettings && (
          <ColumnSettings
            allColumns={allColumns}
            selected={selected}
            onChange={setSelected}
            onClose={()=>setShowSettings(false)}
          />
        )}
        {/* СПІЛЬНИЙ КОНТЕЙНЕР для фільтрів і таблиці */}
        <div style={{width:'97vw',maxWidth:'none',margin:'0 auto'}}>
          <div style={{display:'flex', flexDirection:'column', gap:4, marginBottom:12}}>
            {(() => {
              // Збираємо всі фільтри в масив
              const filterInputs = visibleColumns.filter(col => col.filter).map(col => (
                <input
                  key={col.key}
                  name={col.key}
                  placeholder={col.label}
                  value={filters[col.key] || ''}
                  onChange={onFilterChange}
                  style={{flex:'1 1 120px'}}
                />
              ));
              // Ділимо на три рядки
              const chunkSize = Math.ceil(filterInputs.length / 3);
              const rows = [
                filterInputs.slice(0, chunkSize),
                filterInputs.slice(chunkSize, chunkSize * 2),
                filterInputs.slice(chunkSize * 2)
              ];
              return rows.map((row, i) => (
                <div key={i} style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:2}}>
                  {row}
                  {/* Додаю діапазон дати у перший рядок */}
                  {i === 0 && typeof dateRange !== 'undefined' && typeof setDateRange === 'function' && (
                    <label style={{display:'flex',alignItems:'center',gap:4,marginLeft:8}}>
                      Дата проведення робіт (з - по):
                      <input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({...r, from: e.target.value}))} />
                      <input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({...r, to: e.target.value}))} />
                    </label>
                  )}
                </div>
              ));
            })()}
          </div>
          {/* Окремий контейнер для таблиці з sticky-заголовками */}
          <style>{`
            .table-scroll {
              max-height: 60vh;
              overflow: auto;
              width: 100%;
            }
            .sticky-table {
              min-width: 2000px;
              width: 100%;
              background: #22334a;
              color: #fff;
              border-radius: 8px;
              border-spacing: 0;
              table-layout: auto;
            }
            .sticky-table thead th {
              position: sticky;
              top: 0;
              z-index: 2;
              background: #1976d2;
              white-space: nowrap;
            }
            .sticky-table th, .sticky-table td {
              white-space: nowrap;
            }
            .table-scroll::-webkit-scrollbar {
              height: 12px;
              background: #22334a;
            }
            .table-scroll::-webkit-scrollbar-thumb {
              background: #00bfff;
              border-radius: 6px;
            }
            .table-scroll::-webkit-scrollbar-track {
              background: #22334a;
            }
            .table-scroll {
              scrollbar-color: #00bfff #22334a;
              scrollbar-width: thin;
            }
          `}</style>
          <div className="table-scroll">
            <table className="sticky-table">
              <thead>
                <tr>
                  <th>Дія</th>
                  {(role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'regionalManager') && approveField && <th>Підтвердження</th>}
                  {visibleColumns.map((col, idx) => (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={e => handleDragStart(e, idx)}
                      onDrop={e => handleDrop(e, idx)}
                      onDragOver={handleDragOver}
                      style={{cursor:'move',background:'#1976d2'}}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th>Статус</th>
                  {role === 'admin' && <th>Дата підтвердження</th>}
                  {role !== 'warehouse' && role !== 'regional' && role !== 'accountant' && role !== 'regionalManager' && role !== 'admin' && approveField && <th>Підтвердження</th>}
                  {commentField && <th>Коментар</th>}
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map(t => (
                  <tr key={t.id} style={getRowColor(t) ? {background:getRowColor(t)} : {}}>
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      <button onClick={()=>{setInfoTask(t);setShowInfo(true);}} style={{marginRight:8,background:'#00bfff',color:'#fff'}}>Історія проведення робіт</button>
                      {(role === 'service' || role === 'operator' || role === 'admin') && (
                        <>
                          <button onClick={()=>onEdit && onEdit(t)} style={{marginRight:8}}>Редагувати</button>
                          {role === 'service' && (
                          <button onClick={()=>onDelete && onDelete(t.id)} style={{background:'#f66',color:'#fff'}}>Видалити</button>
                          )}
                        </>
                      )}
                      {(role === 'warehouse' || role === 'accountant' || role === 'regionalManager' || role === 'regional') && (
                        <button onClick={()=>onEdit && onEdit(t)}>Редагувати</button>
                      )}
                    </td>
                    {(role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'regionalManager') && approveField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        {t.status === 'Виконано' ? (
                          <>
                            <button onClick={()=>{onApprove(t.id, 'Підтверджено', '');}} style={{background:'#0a0',color:'#fff',marginRight:8}}>Підтвердити</button>
                            <button onClick={()=>setRejectModal({ open: true, taskId: t.id, comment: '' })} style={{background:'#f66',color:'#fff',marginRight:8}}>Відхилити</button>
                            <button onClick={()=>{onApprove(t.id, 'На розгляді', '');}} style={{background:'#ffe066',color:'#22334a',marginRight:8}}>На розгляді</button>
                            <span style={t[approveField] === 'Підтверджено' ? {color:'#0f0', fontWeight:600} : t[approveField] === 'Відмова' ? {color:'#f00', fontWeight:600} : {color:'#aaa'}}>
                              {t[approveField] === 'Підтверджено' ? 'Підтверджено' : t[approveField] === 'Відмова' ? 'Відхилено' : 'На розгляді'}
                            </span>
                          </>
                        ) : <span style={{color:'#aaa'}}>—</span>}
                      </td>
                    )}
                    {visibleColumns.map(col => <td key={col.key} style={getRowColor(t) ? {color:'#111'} : {}}>{
                      col.key === 'approvedByWarehouse' ? (t.approvedByWarehouse === 'Підтверджено' ? 'Підтверджено' : t.approvedByWarehouse === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByAccountant' ? (t.approvedByAccountant === 'Підтверджено' ? 'Підтверджено' : t.approvedByAccountant === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByRegionalManager' ? (t.approvedByRegionalManager === 'Підтверджено' ? 'Підтверджено' : t.approvedByRegionalManager === 'Відмова' ? 'Відхилено' : 'На розгляді') :
                      t[col.key]
                    }</td>)}
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>{t.status}</td>
                    {role === 'admin' && <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      {(t.bonusApprovalDate || t.approvalDate || '')}
                      <button style={{marginLeft:8}} onClick={() => {
                        let mm = '', yyyy = '';
                        const val = t.bonusApprovalDate || t.approvalDate || '';
                        if (/^\d{2}\.\d{4}$/.test(val)) {
                          [mm, yyyy] = val.split('.');
                        } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                          yyyy = val.slice(0,4); mm = val.slice(5,7);
                        } else {
                          mm = String(now.getMonth()+1).padStart(2,'0');
                          yyyy = String(now.getFullYear());
                        }
                        setEditDateModal({ open: true, taskId: t.id, month: mm, year: yyyy });
                      }}>Змінити</button>
                    </td>}
                    {role !== 'warehouse' && role !== 'regional' && role !== 'accountant' && role !== 'regionalManager' && role !== 'admin' && approveField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        {t.status === 'Виконано' ? (
                          <>
                            <button onClick={()=>{onApprove(t.id, 'Підтверджено', '');}} style={{background:'#0a0',color:'#fff',marginRight:8}}>Підтвердити</button>
                            <button onClick={()=>setRejectModal({ open: true, taskId: t.id, comment: '' })} style={{background:'#f66',color:'#fff',marginRight:8}}>Відхилити</button>
                            <button onClick={()=>{onApprove(t.id, 'На розгляді', '');}} style={{background:'#ffe066',color:'#22334a',marginRight:8}}>На розгляді</button>
                            <span style={t[approveField] === 'Підтверджено' ? {color:'#0f0', fontWeight:600} : t[approveField] === 'Відмова' ? {color:'#f00', fontWeight:600} : {color:'#aaa'}}>
                              {t[approveField] === 'Підтверджено' ? 'Підтверджено' : t[approveField] === 'Відмова' ? 'Відхилено' : 'На розгляді'}
                            </span>
                          </>
                        ) : <span style={{color:'#aaa'}}>—</span>}
                      </td>
                    )}
                    {commentField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        <input
                          value={t[commentField]||''}
                          onChange={e => {onApprove(t.id, t[approveField], e.target.value);}}
                          placeholder="Коментар"
                          style={getRowColor(t) ? {width:120, color:'#111', background:'#fff'} : {width:120}}
                          disabled={t[approveField] !== false}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Індикатор кількості рядків та кнопка "На початок" */}
          <div style={{padding:'8px 16px', background:'#22334a', color:'#fff', borderTop:'1px solid #444', fontSize:'14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span>Всього рядків: {sortedTasks.length}</span>
            <button 
              onClick={() => {
                const container = document.querySelector('.table-scroll');
                if (container) {
                  container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                }
              }}
              style={{
                background:'#00bfff',
                color:'#fff',
                border:'none',
                padding:'4px 12px',
                borderRadius:'4px',
                cursor:'pointer',
                fontSize:'12px'
              }}
            >
              ↑ На початок
            </button>
          </div>
          {showInfo && infoTask && (
            <InfoModal task={infoTask} onClose={()=>setShowInfo(false)} history={getClientHistory(infoTask.client).filter(h=>h.status === 'Виконано')} />
          )}
        </div>
      </div>
      {/* --- Модальне вікно для опису відмови --- */}
      {rejectModal.open && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:320,maxWidth:400,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16}}>
            <h3>Вкажіть опис відмови</h3>
            <textarea
              style={{minHeight:60,background:'#1a2636',color:'#fff',border:'1px solid #444',borderRadius:4,padding:8}}
              value={rejectModal.comment}
              onChange={e => setRejectModal({ ...rejectModal, comment: e.target.value })}
              placeholder="Введіть причину відмови..."
            />
            <div style={{display:'flex',gap:12,marginTop:8}}>
              <button type="button" style={{flex:1,background:'#d32f2f',color:'#fff'}} onClick={handleRejectConfirm} disabled={!rejectModal.comment.trim()}>Підтвердити відмову</button>
              <button type="button" style={{flex:1,background:'#888',color:'#fff'}} onClick={handleRejectCancel}>Скасувати</button>
            </div>
          </div>
        </div>
      )}
      {/* --- Модальне вікно для зміни дати підтвердження премії --- */}
      {role === 'admin' && editDateModal.open && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:320,maxWidth:400,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16}}>
            <h3>Змінити дату підтвердження премії</h3>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <label>Місяць:
                <select value={editDateModal.month} onChange={e => setEditDateModal(m => ({...m, month: e.target.value}))} style={{marginLeft:8}}>
                  <option value="">--</option>
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Рік:
                <select value={editDateModal.year} onChange={e => setEditDateModal(m => ({...m, year: e.target.value}))} style={{marginLeft:8}}>
                  <option value="">--</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            <div style={{display:'flex',gap:12,marginTop:16}}>
              <button type="button" style={{flex:1,background:'#00bfff',color:'#fff'}} onClick={handleSaveBonusDate} disabled={!editDateModal.month || !editDateModal.year}>Зберегти</button>
              <button type="button" style={{flex:1,background:'#888',color:'#fff'}} onClick={()=>setEditDateModal({ open: false, taskId: null, month: '', year: '' })}>Відмінити</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 