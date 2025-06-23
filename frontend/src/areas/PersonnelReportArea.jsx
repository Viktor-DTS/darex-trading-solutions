import React, { useState, useEffect } from 'react';

export default function PersonnelReportArea() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({
    month: '',
    year: new Date().getFullYear().toString(),
    region: ''
  });
  const [regions, setRegions] = useState([]);

  useEffect(() => {
    const savedTasks = localStorage.getItem('tasks');
    const savedUsers = localStorage.getItem('users');
    const savedRegions = localStorage.getItem('regions');
    if (savedTasks) setTasks(JSON.parse(savedTasks));
    if (savedUsers) setUsers(JSON.parse(savedUsers));
    if (savedRegions) setRegions(JSON.parse(savedRegions));
  }, []);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const getReportData = () => {
    const engineerStats = {};

    users.forEach(user => {
      if (user.role === 'service') {
        engineerStats[user.name] = {
          tasks: 0,
          totalSum: 0,
          region: user.region
        };
      }
    });

    tasks.forEach(task => {
      if (task.status === 'Виконано') {
        const taskDate = new Date(task.date);
        const taskMonth = (taskDate.getMonth() + 1).toString();
        const taskYear = taskDate.getFullYear().toString();

        const yearMatch = !filters.year || filters.year === taskYear;
        const monthMatch = !filters.month || filters.month === taskMonth;
        
        if (yearMatch && monthMatch) {
          const processEngineer = (engineerName) => {
            if (engineerStats.hasOwnProperty(engineerName)) {
              const userRegion = engineerStats[engineerName].region;
              if (!filters.region || filters.region === '' || userRegion === filters.region) {
                engineerStats[engineerName].tasks += 1;
                engineerStats[engineerName].totalSum += parseFloat(task.serviceTotal) || 0;
              }
            }
          };

          if (task.engineer1) processEngineer(task.engineer1);
          if (task.engineer2) processEngineer(task.engineer2);
        }
      }
    });

    return Object.entries(engineerStats).map(([name, data]) => ({ name, ...data }));
  };

  const reportData = getReportData();

  const years = [...new Set(tasks.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a);
  const months = [
    { value: '1', label: 'Січень' }, { value: '2', label: 'Лютий' },
    { value: '3', label: 'Березень' }, { value: '4', label: 'Квітень' },
    { value: '5', label: 'Травень' }, { value: '6', 'label': 'Червень' },
    { value: '7', label: 'Липень' }, { value: '8', 'label': 'Серпень' },
    { value: '9', label: 'Вересень' }, { value: '10', 'label': 'Жовтень' },
    { value: '11', label: 'Листопад' }, { value: '12', 'label': 'Грудень' }
  ];

  return (
    <div>
      <h2>Звіт по персоналу</h2>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <select name="month" value={filters.month} onChange={handleFilterChange}>
          <option value="">Всі місяці</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select name="year" value={filters.year} onChange={handleFilterChange}>
          <option value="">Всі роки</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="region" value={filters.region} onChange={handleFilterChange}>
          <option value="">Всі регіони</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Інженер</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Регіон</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Кількість виконаних заявок</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Загальна сума</th>
          </tr>
        </thead>
        <tbody>
          {reportData.map(item => (
            <tr key={item.name}>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.name}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.region}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.tasks}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.totalSum.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}