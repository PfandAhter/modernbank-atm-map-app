import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import './QRPage.css';

function QRPage({
                    isOpen,
                    togglePanel,
                    atmList,
                    setUserPosition,
                    setSelectedAtm,
                    calculateRoute,
                    qrImageData
                }) {
    const [longitudeInput, setLongitudeInput] = useState('');
    const [latitudeInput, setLatitudeInput] = useState('');
    const [selectedATM, setSelectedATM] = useState(null);

    if (!isOpen) return null;

    const handleATMChange = (e) => {
        const selectedId = e.target.value;
        const atm = atmList.find((a) => a.id.toString() === selectedId);
        setSelectedATM(atm);
    };

    const handleSend = async () => {
        const newPosition = {
            latitude: parseFloat(latitudeInput),
            longitude: parseFloat(longitudeInput),
        };
        const newSelectedATM = {
            id: selectedATM.id,
            name: selectedATM.name,
            latitude: selectedATM.latitude,
            longitude: selectedATM.longitude,
        };

        setUserPosition(newPosition);
        debugger;
        setSelectedAtm(newSelectedATM);

        if (selectedATM) {
            try {
                await calculateRoute();
            } catch (err) {
                console.error("QR kod oluşturulurken hata:", err);
            }
        }
    };

    return (
        <div className="qr-backdrop">
            <div className="qr-modal">
                <div className="qr-header">
                    <h3 className="qr-title">ATM Seç</h3>
                </div>

                <div className="qr-content">
                    <div className="qr-form-group">
                        <label className="qr-label">ATM Listesi</label>
                        <select
                            onChange={handleATMChange}
                            value={selectedATM?.id || ''}
                            className="qr-select"
                        >
                            <option value="">Bir ATM seçin</option>
                            {atmList.map((atm) => (
                                <option key={atm.id} value={atm.id}>
                                    {atm.id} - {atm.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="qr-form-group">
                        <label className="qr-label">Enlem (Latitude)</label>
                        <input
                            type="number"
                            value={latitudeInput}
                            onChange={(e) => setLatitudeInput(e.target.value)}
                            className="qr-input"
                            placeholder="Enlem giriniz"
                        />
                    </div>

                    <div className="qr-form-group">
                        <label className="qr-label">Boylam (Longitude)</label>
                        <input
                            type="number"
                            value={longitudeInput}
                            onChange={(e) => setLongitudeInput(e.target.value)}
                            className="qr-input"
                            placeholder="Boylam giriniz"
                        />
                    </div>

                    <div className="qr-button-group">
                        <button
                            onClick={handleSend}
                            className="qr-button qr-button-primary"
                        >
                            Güncelle ve Gönder
                        </button>
                        <button
                            onClick={togglePanel}
                            className="qr-button qr-button-secondary"
                        >
                            Kapat
                        </button>
                    </div>

                    {qrImageData && (
                        <div className="qr-preview">
                            <p>📱 QR Kod:</p>
                            <QRCodeCanvas value={qrImageData} />
                            <p style={{ wordBreak: 'break-all' }}>{qrImageData}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default QRPage;