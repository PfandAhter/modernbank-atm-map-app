export const uploadImageToImgBB = async (base64Image) => {
    // Önce base64 önündeki "data:image/png;base64," kısmını temizleyelim
    const base64Data = base64Image.split(',')[1];

    // imgBB API anahtarını almalısınız - https://api.imgbb.com/ adresinden ücretsiz edinebilirsiniz
    const API_KEY = process.env.IMGBBAPIKEY;

    const formData = new FormData();
    formData.append('key', API_KEY);
    formData.append('image', base64Data);

    try {
        console.log("Görsel yükleme başlatılıyor...");

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Yükleme başarısız: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Görsel başarıyla yüklendi:", data);

        // Yüklenen görselin URL'sini döndür
        return data.data.url;
    } catch (error) {
        console.error("Görsel yükleme hatası:", error);
        throw error;
    }
};
