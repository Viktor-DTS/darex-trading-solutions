const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const reports = [];

app.post('/api/report', (req, res) => {
  const report = req.body;
  reports.push({ ...report, createdAt: new Date() });
  res.json({ success: true, message: 'Звіт збережено!' });
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'Сервер працює!' });
});

app.get('/api/reports', (req, res) => {
  res.json(reports);
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
}); 