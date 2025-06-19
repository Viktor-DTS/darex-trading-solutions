import { useEffect, useState } from 'react';

export default function ReportsList() {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/reports')
      .then(res => res.json())
      .then(setReports);
  }, []);

  if (selected) {
    return (
      <div style={{background:'#1a2636', color:'#fff', borderRadius:12, padding:24, margin:'32px auto', maxWidth:900}}>
        <button onClick={() => setSelected(null)} style={{marginBottom:16}}>Назад до списку</button>
        <h2>Детальний перегляд звіту</h2>
        <table style={{width:'100%', color:'#fff'}}>
          <tbody>
            {Object.entries(selected).map(([key, value]) => (
              <tr key={key}>
                <td style={{fontWeight:'bold', padding:'4px 8px', verticalAlign:'top'}}>{key}</td>
                <td style={{padding:'4px 8px'}}>{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{background:'#1a2636', color:'#fff', borderRadius:12, padding:24, margin:'32px auto', maxWidth:900}}>
      <h2>Всі фінансові звіти</h2>
      {reports.length === 0 && <div>Звітів ще немає.</div>}
      <table style={{width:'100%', color:'#fff', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{borderBottom:'1px solid #444'}}>Дата створення</th>
            <th style={{borderBottom:'1px solid #444'}}>Замовник</th>
            <th style={{borderBottom:'1px solid #444'}}>Номер рахунку</th>
            <th style={{borderBottom:'1px solid #444'}}>Загальна сума послуги</th>
            <th style={{borderBottom:'1px solid #444'}}>Детальніше</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r, i) => (
            <tr key={i} style={{cursor:'pointer', background:i%2?'#22334a':'#1a2636'}}>
              <td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</td>
              <td>{r.client}</td>
              <td>{r.invoice}</td>
              <td>{r.serviceTotal}</td>
              <td><button onClick={() => setSelected(r)}>Детальніше</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 