/**
 * AddServerModal — popup for adding VLESS keys, subscription URLs, or signing in.
 */

import React, { useState } from 'react';

export default function AddServerModal({ onClose, onAddKey, onAddSubscription, onSignIn }) {
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAdd = async () => {
        setError('');
        setSuccess('');
        const trimmed = input.trim();

        if (!trimmed) {
            setError('Вставь ссылку');
            return;
        }

        // Subscription URL
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            setLoading(true);
            const ok = await onAddSubscription(trimmed, '');
            setLoading(false);
            if (ok) {
                setInput('');
                setSuccess('Подписка добавлена ✓');
                setTimeout(() => onClose(), 800);
            } else {
                setError('Не удалось загрузить подписку');
            }
            return;
        }

        // VLESS key
        if (trimmed.startsWith('vless://')) {
            const ok = onAddKey(trimmed);
            if (ok) {
                setInput('');
                setSuccess('Сервер добавлен ✓');
                setTimeout(() => onClose(), 800);
            } else {
                setError('Неверный формат VLESS ключа');
            }
            return;
        }

        setError('Поддерживаются vless:// ключи и https:// подписки');
    };

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content fade-in">
                <div className="modal-header">
                    <span className="modal-title">Подключить сервер</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <div className="modal-input-group">
                        <label className="modal-label">VLESS ключ или ссылка на подписку</label>
                        <textarea
                            className="modal-textarea"
                            placeholder={"vless://uuid@host:port?...#label\nили\nhttps://cdn.example.com/sub/xxxxx"}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAdd();
                                }
                            }}
                            spellCheck={false}
                            rows={3}
                            autoFocus
                        />
                        {error && <div className="modal-feedback error">{error}</div>}
                        {success && <div className="modal-feedback success">{success}</div>}
                    </div>

                    <button
                        className="modal-add-btn"
                        onClick={handleAdd}
                        disabled={loading}
                    >
                        {loading ? '⏳ Загрузка...' : '+ Добавить'}
                    </button>

                    <div className="modal-divider">
                        <span>или</span>
                    </div>

                    <button className="modal-auth-btn" onClick={() => { onSignIn(); onClose(); }}>
                        ✈ Войти через Telegram
                    </button>

                    <div className="modal-hint">
                        Авторизация откроет доступ к серверам Volyent
                    </div>
                </div>
            </div>
        </div>
    );
}
