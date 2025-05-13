import React, { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MiniMap = ({
                     routeData,
                     userPosition,
                     selectedAtm,
                     currentPosition,
                     mapboxToken // Ana uygulamada kullandığınız token
                 }) => {
    const miniMapRef = useRef(null);
    const miniMapInstanceRef = useRef(null);

    // Mini harita oluşturma
    useEffect(() => {
        if (!miniMapRef.current || !mapboxToken) {
            console.warn("MiniMap: mapboxToken veya ref eksik!");
            return;
        }

        console.log("MiniMap: Token alındı:", mapboxToken.substring(0, 5) + "...");

        // accessToken'ı doğrudan ayarla
        mapboxgl.accessToken = mapboxToken;

        // Eğer harita zaten oluşturulmuşsa, tekrar oluşturma
        if (miniMapInstanceRef.current) return;

        try {
            console.log("MiniMap: Harita oluşturuluyor...");
            // Mini harita oluştur
            const miniMapInstance = new mapboxgl.Map({
                container: miniMapRef.current,
                style: 'mapbox://styles/mapbox/streets-v11',
                center: userPosition ? [userPosition.longitude, userPosition.latitude] : [29.0335, 41.0082], // İstanbul default
                zoom: 14,
                interactive: false // Kullanıcı etkileşimini kapatıyoruz
            });

            miniMapInstanceRef.current = miniMapInstance;

            // Harita yüklendiğinde loglama
            miniMapInstance.on('load', () => {
                console.log("MiniMap: Harita başarıyla yüklendi");
            });

            // Harita hata verdiğinde loglama
            miniMapInstance.on('error', (e) => {
                console.error("MiniMap: Harita yükleme hatası:", e);
            });
        } catch (error) {
            console.error("MiniMap: Harita oluşturma hatası:", error);
        }

        return () => {
            if (miniMapInstanceRef.current) {
                console.log("MiniMap: Temizleniyor");
                miniMapInstanceRef.current.remove();
                miniMapInstanceRef.current = null;
            }
        };
    }, [mapboxToken, userPosition]);

    // Rota ve işaretçileri güncelleme
    useEffect(() => {
        const miniMapInstance = miniMapInstanceRef.current;
        if (!miniMapInstance) return;

        // Harita tamamen yüklendiğinde işlemlere devam et
        const setupMap = () => {
            try {
                console.log("MiniMap: Rota ve işaretçiler ayarlanıyor");

                // Mevcut konum ve ATM işaretçilerini temizle ve yeniden ekle
                const markers = document.querySelectorAll('.mapboxgl-marker');
                markers.forEach(marker => marker.remove());

                // Kullanıcı konumu işaretçisi
                if (userPosition) {
                    const el = document.createElement('div');
                    el.style.width = '12px';
                    el.style.height = '12px';
                    el.style.borderRadius = '50%';
                    el.style.backgroundColor = '#4285F4';
                    el.style.border = '2px solid #fff';

                    new mapboxgl.Marker(el)
                        .setLngLat([userPosition.longitude, userPosition.latitude])
                        .addTo(miniMapInstance);
                }

                // ATM konumu işaretçisi
                if (selectedAtm) {
                    const el = document.createElement('div');
                    el.style.width = '12px';
                    el.style.height = '12px';
                    el.style.borderRadius = '50%';
                    el.style.backgroundColor = '#FF5252';
                    el.style.border = '2px solid #fff';

                    new mapboxgl.Marker(el)
                        .setLngLat([selectedAtm.longitude, selectedAtm.latitude])
                        .addTo(miniMapInstance);
                }

                // Rota çizimi
                if (routeData && routeData.geometry) {
                    // Önceki rota varsa kaldır
                    if (miniMapInstance.getSource('route')) {
                        miniMapInstance.removeLayer('route-layer');
                        miniMapInstance.removeSource('route');
                    }

                    miniMapInstance.addSource('route', {
                        type: 'geojson',
                        data: routeData
                    });

                    miniMapInstance.addLayer({
                        id: 'route-layer',
                        type: 'line',
                        source: 'route',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#4285F4',
                            'line-width': 3
                        }
                    });

                    // Rotanın tamamını görünür yap
                    if (routeData.geometry.coordinates.length > 0) {
                        const bounds = new mapboxgl.LngLatBounds();
                        routeData.geometry.coordinates.forEach(coord => {
                            bounds.extend(coord);
                        });
                        miniMapInstance.fitBounds(bounds, { padding: 30 });
                    }
                }
            } catch (error) {
                console.error("MiniMap: Rota ayarlama hatası:", error);
            }
        };

        if (miniMapInstance.loaded()) {
            setupMap();
        } else {
            miniMapInstance.on('load', setupMap);
        }
    }, [routeData, userPosition, selectedAtm]);

    // Animasyon sırasında kullanıcı konumu güncellemesi
    useEffect(() => {
        const miniMapInstance = miniMapInstanceRef.current;
        if (!miniMapInstance || !currentPosition) return;

        // Harita yüklenmişse devam et
        if (!miniMapInstance.loaded()) return;

        try {
            // Anlık konum işaretçisi
            if (!miniMapInstance.getSource('current-position')) {
                miniMapInstance.addSource('current-position', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [currentPosition.longitude, currentPosition.latitude]
                        }
                    }
                });

                miniMapInstance.addLayer({
                    id: 'current-position-circle',
                    type: 'circle',
                    source: 'current-position',
                    paint: {
                        'circle-radius': 6,
                        'circle-color': '#4285F4',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff'
                    }
                });
            } else {
                // Mevcut konum kaynağını güncelle
                miniMapInstance.getSource('current-position').setData({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [currentPosition.longitude, currentPosition.latitude]
                    }
                });
            }
        } catch (error) {
            console.error("MiniMap: Konum güncelleme hatası:", error);
        }
    }, [currentPosition]);

    return (
        <div
            className="mini-map-container"
            style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                width: '300px', //220
                height: '300px', //180
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
                border: '2px solid white',
                zIndex: 999
            }}
        >
            <div ref={miniMapRef} style={{ width: '100%', height: '100%' }} />
            {!mapboxToken && <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center'}}>MapBox token eksik</div>}
        </div>
    );
};

export default MiniMap;