
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl'
import axios from 'axios';
import './App.css';
import MiniMap from "./MiniMap";
import DirectionsPanel from "./DirectionsPanel";
import AtmPanel from "./AtmPanel";


import NotificationPanel from './NotificationPanel';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN ;

// Animasyon frame oranı kontrolü - daha az frame ile daha iyi performans
const ANIMATION_FPS = 144; // 60 yerine 30 FPS kullanarak performans arttırılır
const FRAME_INTERVAL = 1000 / ANIMATION_FPS;


function App() {
    // State tanımlamaları - performans için optimize edildi
    const [viewState, setViewState] = useState({
        latitude: 38.024050,
        longitude: 32.510783,
        zoom: 14,
        pitch: 0,
        bearing: 0,
    });

    const [is3D, setIs3D] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedAtm, setSelectedAtm] = useState(null);
    const [isSendMoneyPanelOpen, setIsSendMoneyPanelOpen] = useState(false);
    const [directionsPanelVisible, setDirectionsPanelVisible] = useState(false);

    const toggleSendMoneyPanel = () => {
        setIsSendMoneyPanelOpen(!isSendMoneyPanelOpen);

        setIsControlPaneDisabled(false); // Panel açıldığında kontrol panelini etkinleştir
    };

    /*const [atmLocations, setAtmLocations] = useState([
        // Varsayılan ATM'ler
        { id: 1, latitude: 41.0082, longitude: 28.9784, name: 'ATM 1' },
        { id: 2, latitude: 41.0122, longitude: 28.9756, name: 'ATM 2' },
        { id: 11, latitude: 38.024050, longitude: 32.510783, name: 'ATM 11' },
        { id: 12, latitude: 38.023999, longitude: 32.510850, name: 'ATM 12' },
        { id: 13, latitude: 38.024022, longitude: 32.510820, name: 'ATM 13' },
        // ...diğer ATM'ler
    ]);*/

    const [bankOptions, setBankOptions] = useState([]);
    const [statusOptions, setStatusOptions] = useState([]);
    const [depositOptions, setDepositOptions] = useState([]);
    const [withdrawOptions, setWithdrawOptions] = useState([]);
    const [bankNames, setBankNames] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDepositStatus, setFilterDepositStatus] = useState('all');
    const [filterWithdrawStatus, setFilterWithdrawStatus] = useState('all');


    const [atmLocations, setAtmLocations] = useState([]);

    const [buildingHeight, setBuildingHeight] = useState(1);

    // Kullanıcı konumu ve rota state'leri
    const [userPosition, setUserPosition] = useState(null);



    const [isDragging, setIsDragging] = useState(false);
    const [showRetryModal, setShowRetryModal] = useState(false);
    const [routeData, setRouteData] = useState(null);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
    const [isControlPaneDisabled, setIsControlPaneDisabled] = useState(false);

    const [routeType, setRouteType] = useState('walking'); // Rota türü (yürüyüş, bisiklet, araba)
    const [selectedRouteType, setSelectedRouteType] = useState('walking');

    const [sendButtonVisibility, setSendButtonVisibility] = useState(true);

    const [routeSteps, setRouteSteps] = useState([]); // Rota adımları

    // Animasyon için gerekli state'ler
    const [animationInProgress, setAnimationInProgress] = useState(false);
    const [animationProgress, setAnimationProgress] = useState(0);
    const animationRef = useRef(null);
    const lastFrameTimeRef = useRef(0); // Frame kısıtlaması için son frame zamanı
    const [cameraPosition, setCameraPosition] = useState(null);
    const [viewTPS, setViewTPS] = useState(false);
    const [followingRoute, setFollowingRoute] = useState(false);
    const [showMarkersInTPS, setShowMarkersInTPS] = useState(true); // TPS modunda simgeleri gösterme kontrolü

    // Önceki kamera konumu (animasyon tamamlandığında geri dönmek için)
    const previousViewStateRef = useRef(null);

    // Sürükleme işlemleri için referans
    const mapRef = useRef(null);

    // Rota verileri için referans - gereksiz yeniden render'ları önler
    const routeDataRef = useRef(null);

    // 3D modu için harita stili - yol ve bina görünürlüğünü sağlayan bir stil seçiyoruz
    const mapStyle = useMemo(() =>
            is3D || viewTPS
                ? "mapbox://styles/mapbox/dark-v8" // streets-v12  // 3D modunda yolları daha iyi gösteren bir stil  //TODO: v8 iyi performans veriyor
                : "mapbox://styles/mapbox/dark-v10"    // 2D modunda karanlık stil
        , [is3D, viewTPS]);

    // 3D bina katman stili - useMemo ile performans iyileştirmesi
    const buildingLayer = useMemo(() => ({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                15, 0,
                15.05, ['*', ['get', 'height'], buildingHeight]
            ],
            'fill-extrusion-base': [
                'interpolate', ['linear'], ['zoom'],
                15, 0,
                15.05, ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.6
        }
    }), [buildingHeight]);

    const stopTPSAnimation = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current); // Animasyonu durdur
            animationRef.current = null;
        }
        setAnimationInProgress(false); // Animasyon durumunu sıfırla
        setFollowingRoute(false); // Rota takibini durdur
        setViewTPS(false); // TPS modundan çık
        setAnimationProgress(0); // Yüzdelik ilerlemeyi sıfırla

        // Önceki görünüm durumuna geri dön
        if (previousViewStateRef.current) {
            setViewState(previousViewStateRef.current);
            previousViewStateRef.current = null;
        }
    }, []);

    const routeLayer = useMemo(() => ({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#3887be',
            'line-width': 5,
            'line-opacity': 0.75
        }
    }), []);

// Animasyonlu rota çizim katmanı - değişiklik yok, ancak Source kısmında lineMetrics: true gerekecek
    const animatedRouteLayer = useMemo(() => ({
        id: 'animated-route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#FF5722',
            'line-width': 8,
            'line-opacity': 0.9,
            'line-gradient': [
                'interpolate',
                ['linear'],
                ['line-progress'],
                0, '#faff00',
                0.1, '#ff9900',
                0.3, '#ff5500',
                1, '#ff0000'
            ]
        }
    }), []);


    // Filtered ATM locations
    const filteredAtmLocations = useMemo(() => {
        return atmLocations.filter((atm) => {
            const banksStatus =
                bankNames === 'all' || atm.name?.toUpperCase() === bankNames.toUpperCase();
            const matchesStatus =
                filterStatus === 'all' || atm.status?.toUpperCase() === filterStatus;
            const matchesDeposit =
                filterDepositStatus === 'all' || atm.depositStatus?.toUpperCase() === filterDepositStatus;
            const matchesWithdraw =
                filterWithdrawStatus === 'all' || atm.withdrawStatus?.toUpperCase() === filterWithdrawStatus;
            return banksStatus && matchesStatus && matchesDeposit && matchesWithdraw;
        });
    }, [atmLocations,bankNames ,filterStatus, filterDepositStatus, filterWithdrawStatus]);

// Önemli: Source tanımını aşağıdaki gibi güncellemeniz gerekiyor
    const routeSource = useMemo(() => ({
        type: 'geojson',
        data: routeData, // routeData değişkeninin tanımlı olduğundan emin olun
        lineMetrics: true // Bu kısım önemli - gradient için gerekli
    }), [routeData]);

    // Rota noktası katmanı - kullanıcının izlediği konum için
    const routePointLayer = {
        id: 'route-point',
        type: 'circle',
        source: 'route-point',
        paint: {
            'circle-radius': 8,
            'circle-color': '#ffcc00',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
        }
    };

    //ATM BILGILERININ BASLANGITA DOLDURULMASI...
    useEffect(() => {
        getAtmLocations();
    }, []);

    useEffect(() => {
        getStatusOptions();
    }, []);


    const getStatusOptions = async () => {
        try{
            const response = await axios.get('http://localhost:8080/api/v1/atm/get-statuses');

            if (response.status === 200) {
                const data = response.data;
                debugger;
                setBankOptions(data.banks || []);
                setStatusOptions(data.statuses || []);
                setWithdrawOptions(data.withdrawStatuses || []);
                setDepositOptions(data.depositStatuses || [])

            }else {
                console.error("Status options alınamadı: Geçersiz yanıt durumu.");
            }

        }catch (error){
            console.error("Status options alınamadı:", error);
        }
    }

    const getAtmLocations = async () => {
        try {
            const response = await axios.get('http://localhost:8080/api/v1/atm/get', {
                params: {
                    id: 'all'
                }
            });

            console.log("ATM verisi alındı:", response.data);
            debugger;

            if (response.status === 200 && response.data?.atmStatusDTOList) {
                const atmList = response.data.atmStatusDTOList.map((atm, index) => ({
                    id: atm.id, // Veya atm.id varsa onu kullan
                    latitude: parseFloat(atm.latitude),
                    longitude: parseFloat(atm.longitude),
                    address: atm.address,
                    name: atm.name,
                    status: atm.status,
                    depositStatus: atm.depositStatus,
                    withdrawStatus: atm.withdrawStatus,
                    supportedBanks: atm.supportedBanks
                }));

                setAtmLocations(atmList);
                setShowRetryModal(false);
            } else {
                setShowRetryModal(true);
            }
        } catch (error) {
            console.error('ATM verisi alinirken hata oluştu:', error);
            setShowRetryModal(true);
        }
    };

    // Kullanıcının güncel konumunu al (sayfa yüklendiğinde)
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserPosition({ latitude, longitude });
                setViewState(prev => ({
                    ...prev,
                    latitude,
                    longitude
                }));
            }, error => {
                console.error("Konum alınamadı:", error);
                // Varsayılan konum olarak İstanbul'u kullan
                setUserPosition({ latitude: 41.0082, longitude: 28.9784 });
            });
        }
    }, []);

    // Animasyon temizleme işlemi
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    // Dönüş açısı hesaplama fonksiyonunu iyileştirelim ve memoize edelim
    const calculateBearing = useCallback((startPoint, endPoint) => {
        const startLat = startPoint[1] * Math.PI / 180;
        const startLng = startPoint[0] * Math.PI / 180;
        const endLat = endPoint[1] * Math.PI / 180;
        const endLng = endPoint[0] * Math.PI / 180;

        const y = Math.sin(endLng - startLng) * Math.cos(endLat);
        const x = Math.cos(startLat) * Math.sin(endLat) -
            Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }, []);

    // Easing fonksiyonu - daha yumuşak hareket için
    const easeInOutCubic = useCallback((t) => {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }, []);

    // TPS modu animasyon başlatma - performans için optimize edildi
    const startTPSAnimation = useCallback(() => {
        if (!routeData || !routeData.geometry || !routeData.geometry.coordinates || routeData.geometry.coordinates.length < 2) {
            return;
        }

        // Mevcut animasyonu temizle
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        // TPS modu için kamera yüksekliği ve açısını ayarla
        setViewTPS(true);
        setFollowingRoute(true);

        // Önceki görünüm durumunu kaydet
        previousViewStateRef.current = {...viewState};

        // Başlangıç değerlerini ayarla
        setAnimationProgress(0);
        setAnimationInProgress(true);

        routeDataRef.current = routeData;
        const coordinates = routeData.geometry.coordinates;
        const totalLength = coordinates.length;

        // Animasyon süresini artırarak hareketi yavaşlatalım (daha tutarlı bir animasyon için)
        const animationDuration = 10000; // 15 saniye 15000
        const startTime = performance.now();
        lastFrameTimeRef.current = startTime;

        // İlk başlangıç noktası ve yönü
        const firstPoint = coordinates[0];
        const secondPoint = coordinates[1];
        const initialBearing = calculateBearing(firstPoint, secondPoint);

        // Kamera başlangıç konumunu ayarla
        setCameraPosition({
            longitude: firstPoint[0],
            latitude: firstPoint[1]
        });

        // Başlangıç durumu
        setViewState({
            longitude: firstPoint[0],
            latitude: firstPoint[1],
            zoom: 18, // TPS için yakın zoom seviyesi
            pitch: 60, // Yukarıdan bakış açısı
            bearing: initialBearing // İlk yön
        });

        if (coordinates && coordinates.length > 0) {
            setCameraPosition({
                longitude: coordinates[0][0],
                latitude: coordinates[0][1]
            });
        }

        // Önceki bearing değerini tutacak değişken
        let prevBearing = initialBearing;

        // Animasyon fonksiyonu - performans optimizasyonu ile
        const animate = (timestamp) => {
            // Frame hızını sınırla - daha tutarlı performans için
            if (timestamp - lastFrameTimeRef.current < FRAME_INTERVAL) {
                animationRef.current = requestAnimationFrame(animate);
                return;
            }

            lastFrameTimeRef.current = timestamp;

            const elapsed = timestamp - startTime;
            let progress = Math.min(elapsed / animationDuration, 1);

            setAnimationProgress(progress);

            // Mevcut koordinatları yakala
            const routeCoords = routeDataRef.current?.geometry?.coordinates || coordinates;

            // Mevcut konum indeksini hesapla
            const pointIndex = Math.min(Math.floor(progress * (routeCoords.length - 1)), routeCoords.length - 2);

            // Baktığımız ve bir sonraki birkaç nokta - yumuşak geçiş için
            const currentPoint = routeCoords[pointIndex];
            const nextPoint = routeCoords[pointIndex + 1];

            // İki nokta arasındaki interpolasyon
            const segmentProgress = (progress * (routeCoords.length - 1)) - pointIndex;

            // Cubic easing ile yumuşak geçiş
            const easeSegmentProgress = easeInOutCubic(segmentProgress);

            const interpolatedLng = currentPoint[0] + (nextPoint[0] - currentPoint[0]) * easeSegmentProgress;
            const interpolatedLat = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * easeSegmentProgress;

            // Kamera yönlendirmesi için ileriyi daha iyi görebilmek amacıyla birkaç nokta ilerisine bak
            const lookAheadIndex = Math.min(pointIndex + 2, routeCoords.length - 1);
            const lookAheadPoint = routeCoords[lookAheadIndex];

            // Yönü hesapla (kameranın hangi yöne bakacağı)
            const targetBearing = calculateBearing(currentPoint, lookAheadPoint);

            // Bearing değerini yumuşak şekilde değiştir (ani dönüşleri engelle)
            let bearingDiff = targetBearing - prevBearing;

            // 180 dereceden fazla fark varsa, kısa yolu seç
            if (bearingDiff > 180) bearingDiff -= 360;
            if (bearingDiff < -180) bearingDiff += 360;

            // Yumuşak geçişli döndürme - maksimum dönüş hızını sınırla
            const maxRotationPerFrame = 2.0; // Maksimum dönüş hızı (derece/frame)
            const smoothBearing = prevBearing + Math.max(
                -maxRotationPerFrame,
                Math.min(maxRotationPerFrame, bearingDiff * easeSegmentProgress)
            );

            // Bir sonraki frame için bearingi güncelle
            prevBearing = smoothBearing;

            // Kamera konumunu güncelle - hem ana harita hem de mini harita tarafından kullanılacak konum
            const updatedCameraPosition = {
                longitude: interpolatedLng,
                latitude: interpolatedLat
            };

            setCameraPosition(updatedCameraPosition);

            // ViewState'i güncelle - haritanın kamera konumu ve açısı
            // Object.freeze ile state değişimini optimize ediyoruz
            const newViewState = Object.freeze({
                longitude: interpolatedLng,
                latitude: interpolatedLat,
                zoom: 18,
                pitch: 60,
                bearing: smoothBearing
            });

            setViewState(newViewState);

            // Animasyon tamamlanmadıysa devam et
            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                // Animasyon tamamlandı
                setAnimationInProgress(false);
                setFollowingRoute(false);

                // Normal görünüme geri dön (isteğe bağlı)
                setTimeout(() => {
                    setViewTPS(false);

                    if (previousViewStateRef.current) {
                        setViewState({
                            ...previousViewStateRef.current,
                            zoom: previousViewStateRef.current.zoom < 15 ? 15 : previousViewStateRef.current.zoom,
                        });
                    }
                }, 1000);
            }
        };

        // Animasyonu başlat
        animationRef.current = requestAnimationFrame(animate);
    }, [routeData, viewState, calculateBearing, easeInOutCubic]);



    // TPS modunda marker görünürlüğünü değiştir
    const toggleMarkerVisibility = useCallback(() => {
        setShowMarkersInTPS(!showMarkersInTPS);
    }, [showMarkersInTPS]);

    // 2D/3D geçiş işlevi - React memo kullanarak iyileştirildi
    const toggle3D = useCallback(() => {
        // Eğer rota animasyonu devam ediyorsa işlem yapma
        if (animationInProgress) return;

        if (!is3D) {
            setViewState(prev => ({
                ...prev,
                pitch: 60,
                bearing: 30,
                zoom: prev.zoom < 15 ? 15 : prev.zoom, // En az 15 zoom seviyesi
            }));
        } else {
            setViewState(prev => ({
                ...prev,
                pitch: 0,
                bearing: 0,
            }));
        }
        setIs3D(prev => !prev);
    }, [is3D, animationInProgress]);

    const cancelSelectedATM = async () => {
        setSelectedAtm(null);
        setDirectionsPanelVisible(false);

        // Yol bilgisini boş bir FeatureCollection yap
        setRouteData({
            type: 'FeatureCollection',
            features: []
        });

        setViewState(prev => ({
            ...prev,
            zoom: 16,
            pitch: 0,
            bearing: 0,
        }));
    };

    // Konum arama işlevi
    const searchLocation = async () => {
        if (!searchText) return;

        try {
            const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${searchText}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const [longitude, latitude] = data.features[0].center;
                setViewState({
                    ...viewState,
                    longitude,
                    latitude,
                    zoom: 14
                });
            }
        } catch (error) {
            console.error("Konum araması sırasında hata:", error);
        }
    };

    // Haritaya tıklama işlevi (yeni ATM ekleme)
    const handleMapClick = (event) => {
        // Animasyon sırasında tıklamaları engelle
        if (animationInProgress) return;

        if (event.originalEvent.ctrlKey) {
            const { lng, lat } = event.lngLat;
            const newAtm = {
                id: atmLocations.length + 1,
                latitude: lat,
                longitude: lng,
                name: `ATM ${atmLocations.length + 1}`,
                isUserCreated: true
            };

            setAtmLocations([...atmLocations, newAtm]);
        }
    };

    // ATM seçme işlevi
    const selectAtm = (atm) => {
        setSelectedAtm(null);
        setDirectionsPanelVisible(false);
        setSendButtonVisibility(true);

        // Yol bilgisini boş bir FeatureCollection yap
        setRouteData({
            type: 'FeatureCollection',
            features: []
        });

        // Animasyon sırasında ATM seçmeyi engelle
        if (animationInProgress) return;

        setSelectedAtm(atm);
        setViewState({
            ...viewState,
            latitude: atm.latitude,
            longitude: atm.longitude,
        });

        if(atm.status !== 'ACTIVE' || atm.withdrawStatus !== 'ACTIVE'){
            setSendButtonVisibility(false);
        }

        // Yeni bir ATM seçildiğinde rota verisini temizle
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            setAnimationInProgress(false);
            setFollowingRoute(false);
            setViewTPS(false);
        }
    };

    // Kullanıcı konumunu sürükleme işlevleri
    const startDragging = (e) => {
        // Animasyon sırasında sürüklemeyi engelle
        if (animationInProgress) return;

        setIsDragging(true);
        // Rota verisini temizle
        setRouteData(null);
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            setAnimationInProgress(false);
            setFollowingRoute(false);
            setViewTPS(false);
        }
    };

    const onDrag = (e) => {
        if (isDragging && mapRef.current && !animationInProgress) {
            const { lat, lng } = e.lngLat;
            setUserPosition({
                latitude: lat,
                longitude: lng
            });
        }
    };

    const stopDragging = () => {
        setIsDragging(false);
    };

    const renderMarkers = useMemo(() => {
        // TPS modunda ve marker görünürlüğü kapalıysa gösterme
        if (viewTPS && !showMarkersInTPS) return null;

        return atmLocations.map((atm) => (
            <Marker
                key={atm.id}
                latitude={atm.latitude}
                longitude={atm.longitude}
                onClick={() => selectAtm(atm)}
            >
                <div className="marker-container">
                    <div className="marker-glow"></div>
                    <div className="marker"></div>
                </div>

                {/*<div className={`marker ${atm.isUserCreated ? 'user-created' : ''} ${selectedAtm?.id === atm.id ? 'selected' : ''}`}></div>*/}
            </Marker>
        ));
    }, [atmLocations, selectedAtm, viewTPS, showMarkersInTPS, selectAtm]);

    const RetryModal = ({ onRetry}) => (
        <div className="retry-modal-overlay">
            <div className="retry-modal">
                <h2>ATM Bilgisi Alma İşlemi Başarısız</h2>
                <button onClick={onRetry}>Yeniden Dene</button>
            </div>
        </div>
    );

    const renderUserMarker = useMemo(() => {
        if (!userPosition || (viewTPS && !showMarkersInTPS)) return null;

        return (
            <Marker
                latitude={userPosition.latitude}
                longitude={userPosition.longitude}
                draggable={true}
                onDragStart={startDragging}
                onDrag={onDrag}
                onDragEnd={stopDragging}
            >
                <div
                    className="user-marker"
                    style={{
                        width: '30px',
                        height: '30px',
                        backgroundColor: '#03A9F4',
                        borderRadius: '50%',
                        border: '3px solid white',
                        cursor: 'grab',
                        position: 'relative',
                    }}
                >
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '10px',
                        height: '10px',
                        backgroundColor: 'white',
                        borderRadius: '50%'
                    }} />
                </div>
            </Marker>
        );
    }, [userPosition, viewTPS, showMarkersInTPS, startDragging, onDrag, stopDragging]);

    const renderDestinationMarker = useMemo(() => {
        if (!viewTPS || !selectedAtm) return null;

        return (
            <Marker
                latitude={selectedAtm.latitude}
                longitude={selectedAtm.longitude}
            >
                {/*<div className="destination-marker">
                    <div className="pulse"></div>
                </div>*/}
                <div className="marker-container">
                    <div className="marker-glow"></div>
                    <div className="marker"></div>
                </div>

            </Marker>
        );
    }, [viewTPS, selectedAtm]);

    const changeRouteType = (type) => {
        setRouteType(type);
        setSelectedRouteType(type); // Seçili butonu güncelle
    }

    // En kısa rota hesaplama
    const calculateRoute = async () => {
        if (!userPosition || !selectedAtm || animationInProgress) return;

        setIsCalculatingRoute(true);
        setDirectionsPanelVisible(true);
        setIsControlPaneDisabled(true);

        try {
            // MapBox Directions API ile rota hesaplama
            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/${routeType}/${userPosition.longitude},${userPosition.latitude};${selectedAtm.longitude},${selectedAtm.latitude}?steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`
            );

            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const newRouteData = {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: data.routes[0].geometry.coordinates
                    }
                };

                setRouteData(newRouteData);

                // Rotanın tamamını görebilmek için harita görünümünü ayarla (TPS başlamadan önce)
                const coordinates = data.routes[0].geometry.coordinates;
                setRouteSteps(data.routes[0].legs[0].steps); // Rota adımlarını al
                console.log("Steps:", data.routes[0]?.legs[0]?.steps);
                const bounds = new mapboxgl.LngLatBounds();

                coordinates.forEach(coord => {
                    bounds.extend(coord);
                });

                // MapRef kullanarak sınırları ayarla
                if (mapRef.current) {
                    mapRef.current.fitBounds(bounds, { padding: 40 });
                }

                // Kısa bir gecikme sonra TPS animasyonu başlat (önce tüm rotayı görmek için)
                setTimeout(() => {
                    setIsControlPaneDisabled(false);
                    // Önceki görünüme geri dön
                    console.log("MapApp: Directions paneli gösteriliyor. isDirectionsActive:", true, "isDirectionsAnimating:", true); // Panel gösterildiğinde log

                    startTPSAnimation();
                }, 1000);
            }
        } catch (error) {
            console.error("Rota hesaplama hatası:", error);
            alert("Rota hesaplanamadı. Lütfen tekrar deneyin.");
        } finally {
            setIsCalculatingRoute(false);
        }
    };

    return (
        <div className="app-container">

            <div className={`map-container ${showRetryModal} ? 'blur' : ''}`}>
                <Map
                    {...viewState}
                    ref={mapRef}
                    onMove={evt => !followingRoute && setViewState(evt.viewState)}
                    onClick={handleMapClick}
                    onDrag={onDrag}
                    onMouseUp={stopDragging}
                    onTouchEnd={stopDragging}
                    mapStyle={mapStyle}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    style={{width: '100%', height: '100%'}}
                    terrain={is3D || viewTPS ? {source: 'mapbox-dem', exaggeration: 1.5} : undefined}
                    attributionControl={false} // Gereksiz kontrolleri kaldırarak hafif performans artışı
                    renderWorldCopies={false} // Dünya tekrarlarını kaldırarak render yükünü azalt
                >

                    {/* ATM Marker'ları - TPS modunda gizlenir !viewTPS && */}
                    {!viewTPS && filteredAtmLocations.map((atm) => (
                        <Marker
                            key={atm.id}
                            latitude={atm.latitude}
                            longitude={atm.longitude}
                            onClick={() => selectAtm(atm)}
                        >
                            {/*<div
                                className={`marker ${atm.isUserCreated ? 'user-created' : ''} ${selectedAtm?.id === atm.id ? 'selected' : ''}`}></div>*/}
                            <div

                                style={{fontSize: '24px', cursor: 'pointer'}} // Adjust size and cursor
                            >
                                🏧 {/* ATM emoji */}
                            </div>
                        </Marker>
                    ))}

                    {/* Kullanıcı konumu (sürüklenebilir) - TPS modunda gizlenir */}
                    {userPosition && !viewTPS && (
                        <Marker
                            latitude={userPosition.latitude}
                            longitude={userPosition.longitude}
                            draggable={true}
                            onDragStart={startDragging}
                            onDrag={onDrag}
                            onDragEnd={stopDragging}
                        >
                            <div
                                className="user-marker"
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#03A9F4',
                                    borderRadius: '50%',
                                    border: '3px solid white',
                                    cursor: 'grab',
                                    position: 'relative',
                                    fontSize: '20px', // Adjust emoji size
                                }}
                            >
                                {/* Display emoji based on selectedRouteType */}
                                {selectedRouteType === 'cycling' && '🚴'}
                                {selectedRouteType === 'walking' && '🚶'}
                                {selectedRouteType === 'driving' && '🚗'}
                            </div>
                        </Marker>
                    )}

                    {/* Rota çizimi - TPS modunda farklı stil kullanılır routeData routeSource*/}
                    {routeData && (
                        <Source id="route" {...routeSource} type="geojson"
                                data={{type: 'FeatureCollection', features: [routeData]}}>
                            <Layer {...(viewTPS ? animatedRouteLayer : routeLayer)} />
                        </Source>
                    )}

                    <Source id="route" type="geojson" data={routeData}>
                        <Layer
                            id="route-line"
                            type="line"
                            paint={{
                                'line-color': '#55b6fb', //0074D9
                                'line-width': 5
                            }}
                        />
                    </Source> {/*TODO: BURAYI YENI EKLEDIM ROTA CIZERKEN YOLUNDA GOZUKMESI ICIN BU..*/}


                    {/* Hedef ATM işareti - TPS modunda gösterilir */}
                    {renderDestinationMarker}

                    {/* Kullanıcı konumu işareti - TPS modunda gösterilir */}
                    {renderUserMarker}


                    {/* Hedef ATM işareti - TPS modunda gösterilir */}
                    {!viewTPS && selectedAtm && (
                        <Marker
                            latitude={selectedAtm.latitude}
                            longitude={selectedAtm.longitude}
                        >
                            <div className="marker-container">
                                <div className="marker-glow"></div>
                                <div className="marker"></div>
                            </div>

                        </Marker>
                    )}

                    {showRetryModal && <RetryModal onRetry={getAtmLocations}/>}


                    {/* 3D görünümde terrain (yükseklik) kaynak tanımı */}
                    {(is3D || viewTPS) && (
                        <Source
                            id="mapbox-dem"
                            type="raster-dem"
                            url="mapbox://mapbox.mapbox-terrain-dem-v1"
                            tileSize={512}
                            maxzoom={14}
                        />
                    )}

                    {/* 3D bina katmanı */}
                    {(is3D || viewTPS) && (
                        <Source id="composite" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
                            <Layer {...buildingLayer} />
                        </Source>
                    )}

                    {/* Harita kontrolleri - TPS modunda gizlenir */}
                    {/*{!viewTPS && <NavigationControl position="top-right" />} {TODO: Burayi cikarttim ve cozuldu suanlik prolbem*/}

                </Map>

                {/* selectedAtm !== null &&*/}
                {directionsPanelVisible && (
                    <DirectionsPanel
                        steps={routeSteps}
                    />
                )}

                {/* Mini harita bileşeni */}
                {animationInProgress && (
                    <MiniMap
                        routeData={routeData}
                        userPosition={userPosition}
                        selectedAtm={selectedAtm}
                        currentPosition={cameraPosition}
                        mapboxToken={MAPBOX_TOKEN}
                    />
                )}

                <div>
                    <NotificationPanel userId={"6bb91e57-032c-40db-b6ce-4e3ef459c3a0"}/>
                </div>

                <AtmPanel
                    isOpen={isSendMoneyPanelOpen}
                    togglePanel={toggleSendMoneyPanel}
                    selectedAtm={selectedAtm}
                />

                {/* Rota hesaplama düğmesi */}
                {userPosition && selectedAtm && !isSendMoneyPanelOpen && (
                    <button
                        onClick={animationInProgress ? stopTPSAnimation : calculateRoute}
                        className="bottom-center-button"
                        disabled={isCalculatingRoute}
                        style={{
                            background: animationInProgress
                                ? `linear-gradient(to right, #4CAF50 ${animationProgress * 100}%, #cccccc ${animationProgress * 100}%)`
                                : undefined,
                        }}
                    >
                        <div className="button-content">
                            {isCalculatingRoute
                                ? 'Hesaplanıyor...'
                                : animationInProgress
                                    ? `Rota Gösteriliyor (${Math.round(animationProgress * 100)}%)`
                                    : 'Animasyonu Başlat'}
                        </div>
                    </button>
                )}

                {/* TPS modu göstergesi */}
                {viewTPS && (
                    <div className="tps-overlay">
                        <div className="tps-info">
                            <div className="tps-progress-bar">
                                <div
                                    className="tps-progress"
                                    style={{width: `${animationProgress * 100}%`}}
                                ></div>
                            </div>
                            <div className="tps-text">
                                {selectedAtm ? `${selectedAtm.name} yolunda` : 'Rota izleniyor'} -
                                %{Math.round(animationProgress * 100)}
                            </div>
                        </div>
                        <div className="tps-compass">
                            <div className="compass-inner" style={{transform: `rotate(${viewState.bearing}deg)`}}>
                                <div className="compass-arrow"></div>
                                <div className="compass-n">N</div>
                            </div>
                        </div>
                        <button
                            className="tps-marker-toggle"
                            onClick={toggleMarkerVisibility}
                        >
                            {showMarkersInTPS ? 'Simgeleri Gizle' : 'Simgeleri Göster'}
                        </button>

                    </div>
                )}

                {/* Animasyon iptal düğmesi */}
                {animationInProgress && (
                    <button
                        className="cancel-animation-btn"
                        onClick={() => {
                            if (animationRef.current) {
                                cancelAnimationFrame(animationRef.current);
                                setAnimationInProgress(false);
                                setFollowingRoute(false);
                                setViewTPS(false);

                                // Önceki görünüme geri dön
                                if (previousViewStateRef.current) {
                                    setViewState(previousViewStateRef.current);
                                }
                            }
                        }}
                    >
                        Animasyonu İptal Et
                    </button>
                )}
            </div>

            {/* Kontrol paneli - TPS modunda gizlenir */}
            {!viewTPS && !isSendMoneyPanelOpen && !showRetryModal && (
                <div className={`control-panel ${isControlPaneDisabled} ? 'disabled' : ''}`}>
                    <h2>ATM Harita Uygulaması</h2>

                    {/* Arama kutusu */}
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="Şehir veya bölge ara..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="search-input"
                            onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
                        />
                        <button onClick={searchLocation} className="search-button">Ara</button>
                    </div>

                    <button
                        onClick={cancelSelectedATM}
                        className="cancel-button"
                        disabled={selectedAtm === null}
                    > X
                    </button>

                    {/* 2D/3D geçiş düğmesi */}
                    <button
                        onClick={toggle3D}
                        className="view-toggle-button"
                        disabled={animationInProgress}
                    >
                        {is3D ? '2D Görünüme Geç' : '3D Görünüme Geç'}
                    </button>

                    {/* 3D modda bina yüksekliği kontrolü
                    {is3D && (
                        <div className="building-controls">
                            <label>Bina Yüksekliği: {buildingHeight}x</label>
                            <input
                                type="range"
                                min="0.5"
                                max="3"
                                step="0.1"
                                value={buildingHeight}
                                onChange={(e) => setBuildingHeight(parseFloat(e.target.value))}
                                className="height-slider"
                            />
                        </div>
                    )}*/}


                    <div className="filter-container-modern">
                        <div className="filter-group-top">
                            <label htmlFor="bankNames">Banka</label>
                            <select id="bankNames" value={bankNames} onChange={(e) => setBankNames(e.target.value)}>
                                <option value="all">All</option>
                                {bankOptions.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group-top">
                            <label htmlFor="status">Durum</label>
                            <select id="status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                <option value="all">All</option>
                                {statusOptions.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label htmlFor="deposit">Para Yatirma</label>
                            <select id="deposit" value={filterDepositStatus}
                                    onChange={(e) => setFilterDepositStatus(e.target.value)}>
                                <option value="all">All</option>
                                {depositOptions.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label htmlFor="withdraw">Para Cekme</label>
                            <select id="withdraw" value={filterWithdrawStatus}
                                    onChange={(e) => setFilterWithdrawStatus(e.target.value)}>
                                <option value="all">All</option>
                                {withdrawOptions.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                    </div>


                    {selectedAtm && (
                        <div className="route-type-buttons-container">
                            <button
                                onClick={() => changeRouteType('cycling')}
                                className={`route-type-cycling-button ${selectedRouteType === 'cycling' ? 'selected' : ''}`}
                                disabled={animationInProgress}
                            >
                                🚴 Bicycle
                            </button>
                            <button
                                onClick={() => changeRouteType('walking')}
                                className={`route-type-walking-button ${selectedRouteType === 'walking' ? 'selected' : ''}`}
                                disabled={animationInProgress}
                            >
                                🚶 Walking
                            </button>
                            <button
                                onClick={() => changeRouteType('driving')}
                                className={`route-type-driving-button ${selectedRouteType === 'driving' ? 'selected' : ''}`}
                                disabled={animationInProgress}
                            >
                                🚗 Driving
                            </button>
                        </div>
                    )}


                    {/* Bilgi kutusu */}
                    {!selectedAtm && (
                        <div className="info-box">
                            <p><strong>İpuçları:</strong></p>
                            <ul>
                                <li>ATM eklemek için CTRL tuşuna basılı tutarak haritaya tıklayın.</li>
                                <li>Konumunuzu taşımak için mavi kişi simgesini sürükleyin.</li>
                                <li>Rota hesaplamak için bir ATM seçin ve "TPS Modunda Rotayı İzle" düğmesine
                                    tıklayın.
                                </li>
                                <li>TPS modunda harita, rotayı birinci kişi görünümünde izleyecektir.</li>
                            </ul>
                        </div>
                    )}


                    {/* Seçilen ATM bilgisi */}
                    {selectedAtm && (
                        <div className="selected-info">
                            <h3 className= "selected-info-h3">{selectedAtm.name}</h3>
                            <p>Enlem: {selectedAtm.latitude.toFixed(4)}</p>
                            <p>Boylam: {selectedAtm.longitude.toFixed(4)}</p>
                            <p>Adres: {selectedAtm.address}</p>
                            <p>Durum: {selectedAtm.status}</p>
                            <p>Para Yatirma: {selectedAtm.depositStatus}</p>
                            <p>Para Cekme: {selectedAtm.withdrawStatus}</p>
                            <p>Desteklenen Bankalar:</p>
                            <ul>
                                {selectedAtm.supportedBanks?.map((bank, index) => (
                                    <li key={bank.id}> {bank.name}</li>
                                ))}
                            </ul>
                            {selectedAtm.isUserCreated && <p><em>Bu ATM sizin tarafınızdan oluşturuldu</em></p>}
                        </div>
                    )}

                    <div>
                        {selectedAtm && (
                            <div className="sendMoney-button">
                                <button
                                    onClick={toggleSendMoneyPanel}
                                    className="sendMoney-button"
                                    disabled={!sendButtonVisibility} // Disable the button if sendButtonVisibility is false
                                    style={{
                                        opacity: sendButtonVisibility ? 1 : 0.5, // Adjust opacity for visual feedback
                                        cursor: sendButtonVisibility ? 'pointer' : 'not-allowed', // Change cursor style
                                    }}
                                >
                                    Para Gönder
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}

export default App;