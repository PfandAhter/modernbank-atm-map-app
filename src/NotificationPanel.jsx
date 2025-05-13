import React, { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import './NotificationPanel.css';

const NotificationPanel = ({ userId }) => {
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const clientRef = useRef(null);

    useEffect(() => {
        if (clientRef.current) return;

        const socket = new SockJS('http://localhost:8090/notification-websocket');
        const client = new Client({
            webSocketFactory: () => socket,
            reconnectDelay: 5000,
            onConnect: () => {
                console.log('Connected to WebSocket');
                console.log("user id: " + userId);

                client.subscribe(`/user/${userId}/notifications`, (message) => {
                    const data = JSON.parse(message.body);

                    const notification = {
                        id: data.id || Date.now(),
                        message: data.message,
                        title: data.title,
                        type: data.type,
                        timestamp: new Date().toLocaleString()
                    };

                    setNotifications(prev => [notification, ...prev]);
                    setUnreadCount(prev => prev + 1);
                });
            },
            onStompError: (frame) => {
                console.error('STOMP error:', frame);
            }
        });

        client.activate();
        clientRef.current = client;

        return () => {
            if (client && client.connected) {
                client.deactivate();
            }
        };
    }, [userId]);

    const handleDelete = (id) => {
        setNotifications(prev => prev.filter(notif => notif.id !== id));
    };

    const togglePanel = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            setUnreadCount(0); // panel açılınca okunmuş say
        }
    };

    return (
        <div className="notification-container">
            <button className="notification-button" onClick={togglePanel}>
                🔔
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>

            {isOpen && (
                <div className="notification-panel">
                    <h3 className="panel-title">Bildirimler</h3>
                    <ul className="notification-list">
                        {notifications.map((notif) => (
                            <li key={notif.id} className="notification-item">
                                <div className="notification-header">
                                    <strong>{notif.title}</strong>
                                    <span className="delete-icon" onClick={() => handleDelete(notif.id)}>🗑️</span>
                                </div>
                                <div>{notif.message}</div>
                                <div className="timestamp">{notif.timestamp}</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default NotificationPanel;