import React, { useCallback, useEffect, useState } from 'react';
import API_BASE_URL from '../../config';
import './MobileAppReleaseTab.css';

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('uk-UA');
}

export default function MobileAppReleaseTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [urls, setUrls] = useState({ installPageUrl: '', downloadUrl: '' });
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [copied, setCopied] = useState('');

  const token = () => localStorage.getItem('token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/app-version/admin`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Не вдалося завантажити реліз');
      }
      const data = await res.json();
      setCurrent(data.current || null);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setUrls(data.urls || { installPageUrl: '', downloadUrl: '' });
      if (!version && data.current?.latest_version) {
        setVersion(data.current.latest_version);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      alert(value);
    }
  };

  const publish = async () => {
    if (!file) {
      alert('Оберіть APK');
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version.trim())) {
      alert('Версія має бути у форматі 0.3.3');
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('version', version.trim());
      body.append('changelog', changelog.trim());
      body.append('forceUpdate', forceUpdate ? 'true' : 'false');
      body.append('notifyUsers', notifyUsers ? 'true' : 'false');
      const res = await fetch(`${API_BASE_URL}/app-version`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося зберегти APK');
      setFile(null);
      setChangelog('');
      await load();
      const pruned = data.pruned?.removed ? ` Видалено старих APK: ${data.pruned.removed}.` : '';
      alert(`Опубліковано ${version.trim()}.${pruned} Користувачі побачать оновлення при вході в додаток.`);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleForce = async () => {
    if (!current?.latest_version) return;
    try {
      const res = await fetch(`${API_BASE_URL}/app-version`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ forceUpdate: !current.force_update }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося змінити обов’язковість');
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div className="admin-section">Завантаження хаба оновлень…</div>;
  }

  const installPage = urls.installPageUrl || current?.install_page_url || '';
  const downloadLink = urls.downloadUrl || current?.android_store_url || '';

  return (
    <div className="admin-section mar-wrap">
      <h3>📱 DTS Mobile — оновлення</h3>
      <p className="info-text">
        APK зберігається в MongoDB (GridFS), не в Cloudinary — фото й договори заявок не чіпаються.
        Тариф Cloudinary має ліміт 20 МБ на файл, а збірка ~67 МБ, тому сховище саме в базі.
        Завжди лишається поточний установчий файл + максимум 3 попередні оновлення.
        Найстаріше оновлення видаляється автоматично.
      </p>

      <div className="mar-links">
        <div className="mar-link-card">
          <b>Перша установка</b>
          <code>{installPage || 'з’явиться після деплою'}</code>
          <button type="button" disabled={!installPage} onClick={() => copy(installPage, 'page')}>
            {copied === 'page' ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>
        <div className="mar-link-card">
          <b>Пряме завантаження APK</b>
          <code>{downloadLink || 'немає активного файлу'}</code>
          <button type="button" disabled={!downloadLink} onClick={() => copy(downloadLink, 'apk')}>
            {copied === 'apk' ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>
      </div>

      <div className="mar-current">
        <h4>Поточна збірка</h4>
        {current?.download_url ? (
          <ul>
            <li>Версія: <b>{current.latest_version}</b></li>
            <li>Розмір: {formatSize(current.file_size) || '—'}</li>
            <li>Обов’язкове: {current.force_update ? 'так' : 'ні'}</li>
            <li>Опубліковано: {formatDate(current.published_at)}</li>
            {current.changelog ? <li>{current.changelog}</li> : null}
          </ul>
        ) : (
          <p className="info-text">Ще немає збірки в базі. Завантажте перший APK нижче.</p>
        )}
        {current?.download_url ? (
          <button type="button" className="btn-test" onClick={toggleForce}>
            {current.force_update ? 'Зробити рекомендованим' : 'Зробити обов’язковим'}
          </button>
        ) : null}
      </div>

      <div className="telegram-form">
        <h4>Викласти нову версію</h4>
        <div className="form-group">
          <label>Версія (як у pubspec.yaml)</label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="0.3.3"
          />
        </div>
        <div className="form-group">
          <label>APK</label>
          <input
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file ? <small>{file.name} · {formatSize(file.size)}</small> : null}
        </div>
        <div className="form-group">
          <label>Що нового</label>
          <textarea
            rows={3}
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="Коротко для користувачів"
          />
        </div>
        <label className="mar-check">
          <input type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} />
          Обов’язкове оновлення (без «Пізніше»)
        </label>
        <label className="mar-check">
          <input type="checkbox" checked={notifyUsers} onChange={(e) => setNotifyUsers(e.target.checked)} />
          Надіслати push користувачам
        </label>
        <button type="button" className="btn-test" onClick={publish} disabled={saving}>
          {saving ? 'Збереження APK…' : 'Опублікувати'}
        </button>
      </div>

      {history.length ? (
        <div className="mar-history">
          <h4>Файли в базі (установчий + до 3 оновлень)</h4>
          <ul>
            {history.map((row, idx) => (
              <li key={row._id}>
                {idx === 0 ? 'Установчий' : `Оновлення ${idx}`} · {row.version} · {formatDate(row.publishedAt)}
                {row.publishedBy ? ` · ${row.publishedBy}` : ''}
                {formatSize(row.fileSize) ? ` · ${formatSize(row.fileSize)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
