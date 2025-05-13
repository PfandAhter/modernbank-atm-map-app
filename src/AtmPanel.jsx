import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './AtmPanel.css';
import NotificationPanel from "./NotificationPanel";

function AtmPanel({ isOpen, togglePanel, selectedAtm }) {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccountIban, setSelectedAccountIban] = useState('');
    const [identifier, setIdentifier] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [namePreview, setNamePreview] = useState('');
    const [nameInput, setNameInput] = useState('');
    const [isIbanMode, setIsIbanMode] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const fetchAccounts = async () => {
            try {
                const response = await axios.post('http://localhost:8081/api/v1/account/get', {
                    token: "test"
                });
                if (response.status === 200) {
                    setAccounts(response.data.accounts || []);
                    localStorage.setItem("senderFirstName", response.data.firstName);
                    localStorage.setItem("senderSecondName", response.data.secondName);
                    localStorage.setItem("senderLastName", response.data.lastName);
                }
            } catch (error) {
                console.error("Hesaplar alınamadı:", error);
            }
        };

        fetchAccounts();
    }, [isOpen]);

    const handleIdentifierChange = (e) => {
        const value = e.target.value;
        setIdentifier(value);

        if (value.length === 11 && /^\d{11}$/.test(value)) {
            // TC girildi
            setIsIbanMode(false);
            setNamePreview('');
            setNameInput('');
        } else if (value.length >= 15) {
            // IBAN girildi
            setIsIbanMode(true);

            // IBAN'ı query parametresi olarak gönder (@RequestParam için)
            axios.get(`http://localhost:8081/api/v1/account/get/user/by-iban?iban=${value}`)
                .then(res => {
                    const { firstName, secondName, lastName } = res.data;

                    const maskedFirst = firstName?.slice(0, 2) + '*'.repeat(firstName.length - 2 || 0);
                    const maskedSecond = secondName ? secondName.slice(0, 2) + '*'.repeat(secondName.length - 2) : '';
                    const maskedLast = lastName?.slice(0, 2) + '*'.repeat(lastName.length - 2 || 0);

                    setNamePreview([maskedFirst, maskedSecond, maskedLast].filter(Boolean).join(' '));
                })
                .catch(err => {
                    console.error("IBAN ile kullanıcı bulunamadı:", err);
                    setNamePreview('');
                    setNameInput('');
                });
        } else {
            setIsIbanMode(false);
            setNamePreview('');
            setNameInput('');
        }
    };

    const handleSend = () => {
        if (Number(amount) <= 0) {
            alert("Lütfen geçerli bir tutar girin.");
            return;
        }

        if (identifier.length === 11 || !identifier.startsWith("TR")) {
            axios.post('http://localhost:8082/api/v1/transaction/transfer/atm', {
                atmId: selectedAtm.id,
                senderIban: selectedAccountIban,
                senderFirstName: localStorage.getItem("senderFirstName"),
                senderSecondName: localStorage.getItem("senderSecondName"),
                senderLastName: localStorage.getItem("senderLastName"),
                receiverTckn: identifier,
                amount: amount,
                description: description

            }).then(() => alert("Transfer başarılı.")).catch(console.error);
        } else if (identifier.length >= 26 || identifier.startsWith("TR")) {
            // IBAN transferinde alıcı tam adını kontrol et

            if (!nameInput.trim()) {
                alert("Lütfen alıcının tam adını giriniz.");
                return;
            }

            var receiverFirstName;
            var receiverSecondName;
            var receiverLastName;

            if(nameInput.split(' ').length === 3){
                receiverFirstName = nameInput.split(' ')[0];
                receiverSecondName = nameInput.split(' ')[1];
                receiverLastName = nameInput.split(' ')[2];
            }else{
                receiverFirstName = nameInput.split(' ')[0];
                receiverSecondName = "";
                receiverLastName = nameInput.split(' ')[1];
            }

            axios.post('http://localhost:8082/api/v1/transaction/transfer/atm', {
                atmId: selectedAtm.id,
                senderIban: selectedAccountIban,
                senderFirstName: localStorage.getItem("senderFirstName"),
                senderSecondName: localStorage.getItem("senderSecondName"),
                senderLastName: localStorage.getItem("senderLastName"),

                receiverIban: identifier,
                receiverFirstName: receiverFirstName,
                receiverSecondName: receiverSecondName,
                receiverLastName: receiverLastName,
                amount: amount,
                description: description
            }).then(() => alert("Transfer başarılı.")).catch(console.error);
        } else {
            alert("Geçerli bir TC veya IBAN giriniz.");
        }
    };

    if (!isOpen) return null;

    return (

        <div className="atm-panel-overlay">


            <div className="atm-panel">

                <h2>{selectedAtm.name} ATM - Para Gönder</h2>

                <label>
                    Hesap Seç:
                    <select onChange={(e) => setSelectedAccountIban(e.target.value)} value={selectedAccountIban}>
                        <option value="">-- Hesap Seçiniz --</option>
                        {accounts.map((account, index) => (
                            <option key={index} value={account.iban}>
                                {account.name} - {account.balance} ({account.currency})
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    Alıcı TC / IBAN:
                    <input
                        type="text"
                        value={identifier}
                        onChange={handleIdentifierChange}
                        maxLength={26}
                        minLength={11}
                    />
                </label>

                {isIbanMode && namePreview && (
                    <>
                        <label>
                            Alıcı İsim Önizleme: <strong>{namePreview}</strong>
                        </label>
                        <label>
                            Alıcının Tam Adı:
                            <input
                                type="text"
                                placeholder="Örn: Ahmet Kemal Taner"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                            />
                            <small>Lütfen alıcının tam adını ve soyadını giriniz.</small>
                        </label>
                    </>
                )}

                <label>
                    Gönderilecek Tutar (TL):
                    <input
                        type="number"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </label>

                <label>
                    Açıklama:
                    <input
                        type="text"
                        value={description}
                        maxLength={50}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </label>

                <div className="panel-buttons">
                    <button onClick={handleSend}>Gönder</button>
                    <button onClick={togglePanel}>Kapat</button>
                </div>
            </div>
        </div>
    );
}

export default AtmPanel;