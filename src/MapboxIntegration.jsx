import React, { useState, useRef, useCallback, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import DirectionsPanel from './DirectionsPanel';

// Mapbox token'ınızı buraya ekleyin
const MAPBOX_TOKEN = '';

// Diğer sabitler
const FRAME_INTERVAL = 16; // ~ 60fps

const MapboxIntegration = ({ routeData }) => {
    // State yönetimi
    const [viewState, setViewState] = useState({
        longitude: 29.0335, // Istanbul örneği - kendi başlangıç konumunuza göre ayarlayın
        latitude: 41.0082,
        zoom: 14,
        pitch: 0,
        bearing: 0
    });

    const [viewTPS, setViewTPS] = useState(false);
    const [followingRoute, setFollowingRoute] = useState(false);
    const [miniMapVisible, setMiniMapVisible] = useState(false);
    const [animationProgress, setAnimationProgress] = useState(0);
    const [animationInProgress, setAnimationInProgress] = useState(false);
    const [cameraPosition, setCameraPosition] = useState(null);

    // Referanslar
    const animationRef = useRef(null);
    const routeDataRef = useRef(null);
    const previousViewStateRef = useRef(null);
    const lastFrameTimeRef = useRef(0);

    // Easing fonksiyonu - yumuşak animasyon için
    const easeInOutCubic = (t) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    // İki nokta arasındaki açıyı hesapla - yönlendirme için
    const calculateBearing = useCallback((start, end) => {
        const startLat = start[1] * Math.PI / 180;
        const startLng = start[0] * Math.PI / 180;
        const endLat = end[1] * Math.PI / 180;
        const endLng = end[0] * Math.PI / 180;

        const y = Math.sin(endLng - startLng) * Math.cos(endLat);
        const x = Math.cos(startLat) * Math.sin(endLat) -
            Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        bearing = (bearing + 360) % 360; // 0-360 arasına normalleştir

        return bearing;
    }, []);

    // Rota animasyonunu başlat
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
        const animationDuration = 10000; // 10 saniye
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
                setMiniMapVisible(false); // Mini haritayı gizle

                // Normal görünüme geri dön (isteğe bağlı)
                setTimeout(() => {
                    setViewTPS(false);
                    // Önceki görünüme geri dön
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

    // Rota yüklendiğinde otomatik başlat (isteğe bağlı)
    useEffect(() => {
        if (routeData && routeData.geometry && routeData.geometry.coordinates) {
            // Haritayı rota başlangıcına konumlandır
            const startPoint = routeData.geometry.coordinates[0];
            setViewState(prev => ({
                ...prev,
                longitude: startPoint[0],
                latitude: startPoint[1],
                zoom: 14
            }));

            // Animasyonu başlatmak istiyorsanız:
            // startTPSAnimation();
        }
    }, [routeData]);

    // Animasyonu temizle (component unmount olduğunda)
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    // Rota katmanı stil tanımlaması
    const routeLayer = {
        id: 'route',
        type: 'line',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#007cbf',
            'line-width': 8
        }
    };

    return (
        <div className="mapbox-container">
            <Map
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ width: '100%', height: '100vh' }}
                mapStyle="mapbox://styles/mapbox/streets-v11"
                mapboxAccessToken={MAPBOX_TOKEN}
            >
                {routeData && (
                    <Source id="route-source" type="geojson" data={routeData}>
                        <Layer {...routeLayer} />
                    </Source>
                )}
            </Map>

            {/* Kontrol butonları */}
            <div className="map-controls">
                <button
                    className="control-button"
                    onClick={startTPSAnimation}
                    disabled={!routeData || animationInProgress}
                >
                    Rotada İlerle
                </button>

                {animationInProgress && (
                    <button
                        className="control-button stop"
                        onClick={() => {
                            if (animationRef.current) {
                                cancelAnimationFrame(animationRef.current);
                            }
                            setAnimationInProgress(false);
                            setFollowingRoute(false);
                            setViewTPS(false);

                            // Önceki görünüme geri dön
                            if (previousViewStateRef.current) {
                                setViewState(previousViewStateRef.current);
                            }
                        }}
                    >
                        Durdur
                    </button>
                )}
            </div>

            {/* Yol Tarifi Paneli */}
            {routeData && (
                <DirectionsPanel
                    routeData={routeData}
                    animationInProgress={animationInProgress}
                    animationProgress={animationProgress}
                    cameraPosition={cameraPosition}
                    miniMapVisible={miniMapVisible}
                />
            )}

            {/* CSS stilleri */}
            <style jsx>{`
        .mapbox-container {
          position: relative;
          width: 100%;
          height: 100vh;
        }
        
        .map-controls {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          display: flex;
          gap: 10px;
        }
        
        .control-button {
          padding: 10px 20px;
          background-color: #4285F4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .control-button:hover {
          background-color: #3367D6;
        }
        
        .control-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        .control-button.stop {
          background-color: #DB4437;
        }
        
        .control-button.stop:hover {
          background-color: #C53929;
        }
      `}</style>
        </div>
    );
};

export default MapboxIntegration;