// ================= WRAPPER INDEXEDDB =================
const DB_NAME = 'KasirPosDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

async function idbSet(key, value) {
    const db = await dbPromise;
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, value });
        tx.oncomplete = () => resolve();
    });
}

async function idbGet(key) {
    const db = await dbPromise;
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
    });
}
async function idbClear() {
    const db = await dbPromise;
    return new Promise(resolve => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
    });
}

// ================= CUSTOM UI ALERT & CONFIRM =================
function uiAlert(message) {
    document.getElementById('alert-msg').innerText = message;
    document.getElementById('custom-alert').style.display = 'flex';
}

function uiConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm');
        document.getElementById('confirm-msg').innerText = message;
        modal.style.display = 'flex';
        
        document.getElementById('btn-confirm-yes').onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };
        document.getElementById('btn-confirm-no').onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openAboutModal(event) { 
    if(event) event.preventDefault(); 
    document.getElementById('modal-about').style.display = 'flex'; 
}
function zoomImage(src) {
    document.getElementById('img-zoom-result').src = src;
    document.getElementById('modal-zoom').style.display = 'flex';
}

// ================= STATE APLIKASI =================
let storeData = { 
    initials: '', name: '', contact: '', address: '', cashier: '', payment: '', logo: null, footer: '' 
};
let products = [];
let historyTrx = [];
let bonData = [];
let cart = [];
let salesChartInst = null;

let editProductId = null;
let editRiwayatId = null;
let editBonId = null;
let payBonId = null;
let tempLogoBase64 = null; 

const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

// ================= INISIALISASI ASYNC =================
window.onload = async () => {
    storeData = (await idbGet('pos_store')) || storeData;
    products = (await idbGet('pos_products')) || [];
    historyTrx = (await idbGet('pos_history')) || [];
    bonData = (await idbGet('pos_bon')) || [];
    
    const isDark = await idbGet('pos_darkmode');
    if(isDark) {
        document.body.classList.add('dark-mode');
        document.getElementById('toggle-dark').checked = true;
    }

    loadSettingsForm();
    renderProducts();
    renderKasirProducts();
    renderHistoryAndChart();
    renderBon();
};

// ================= NAVIGASI =================
function switchPage(pageId, title, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    element.classList.add('active');
    document.getElementById('header-title').innerText = title;
    if (pageId === 'laporan' && salesChartInst) salesChartInst.resize();
}

function switchSubTab(subId, element) {
    document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sub-nav-btn').forEach(n => n.classList.remove('active'));
    document.getElementById('sub-' + subId).classList.add('active');
    element.classList.add('active');
    if (subId === 'grafik' && salesChartInst) salesChartInst.resize();
}

async function toggleDarkMode() {
    const isDark = document.getElementById('toggle-dark').checked;
    if (isDark) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
    await idbSet('pos_darkmode', isDark);
    if(salesChartInst) renderHistoryAndChart();
}

// ================= PENGATURAN TOKO & BACKUP =================
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 1048576) {
        uiAlert('Ukuran gambar melebihi 1 MB! Silakan kompres gambar terlebih dahulu.');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        tempLogoBase64 = e.target.result;
        const preview = document.getElementById('logo-preview');
        preview.src = tempLogoBase64;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function loadSettingsForm() {
    document.getElementById('set-initials').value = storeData.initials || '';
    document.getElementById('set-name').value = storeData.name || '';
    document.getElementById('set-contact').value = storeData.contact || '';
    document.getElementById('set-address').value = storeData.address || '';
    document.getElementById('set-cashier').value = storeData.cashier || '';
    document.getElementById('set-payment').value = storeData.payment || '';
    document.getElementById('set-footer').value = storeData.footer || '';
    
    const preview = document.getElementById('logo-preview');
    if(storeData.logo) {
        preview.src = storeData.logo;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

async function saveSettings() {
    storeData = {
        initials: document.getElementById('set-initials').value.toUpperCase().substring(0,4) || 'TOKO',
        name: document.getElementById('set-name').value || 'Toko Digital',
        contact: document.getElementById('set-contact').value || '',
        address: document.getElementById('set-address').value || '',
        cashier: document.getElementById('set-cashier').value || 'Admin',
        payment: document.getElementById('set-payment').value || 'Transfer Bank',
        footer: document.getElementById('set-footer').value || '',
        logo: tempLogoBase64 !== null ? tempLogoBase64 : (storeData.logo || null)
    };
    await idbSet('pos_store', storeData);
    uiAlert('Pengaturan Toko Berhasil Disimpan!');
}

function backupData() {
    const dataToExport = { storeData, products, historyTrx, bonData };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `Cadangan_${storeData.initials}_${Date.now()}.json`);
    dlAnchorElem.click();
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if(data.storeData && data.products && data.historyTrx) {
                storeData = data.storeData; products = data.products; historyTrx = data.historyTrx; bonData = data.bonData || [];
                await idbSet('pos_store', storeData); await idbSet('pos_products', products); await idbSet('pos_history', historyTrx); await idbSet('pos_bon', bonData);
                loadSettingsForm(); renderProducts(); renderKasirProducts(); renderHistoryAndChart(); renderBon();
                uiAlert('Data Berhasil Dipulihkan!');
            } else uiAlert('Format file cadangan tidak sesuai!');
        } catch (err) { uiAlert('Gagal membaca file cadangan!'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

async function resetApp() {
    if(await uiConfirm('YAKIN RESET SEMUA DATA?\nData Laporan, Bon, & Produk akan hilang permanen.')){
        await idbClear();
        location.reload();
    }
}

// ================= MANAJEMEN PRODUK =================
async function saveProduct() {
    const name = document.getElementById('prod-name').value;
    const capital = parseInt(document.getElementById('prod-capital').value) || 0;
    const price = parseInt(document.getElementById('prod-price').value);
    
    if(!name || !price || isNaN(price)) return uiAlert('Nama dan Harga Jual produk harus diisi valid!');
    
    if(editProductId) {
        const index = products.findIndex(p => p.id === editProductId);
        if(index !== -1) {
            products[index] = { id: editProductId, name, capital, price };
            uiAlert('Produk berhasil diperbarui!');
        }
        cancelEdit();
    } else {
        products.push({ id: Date.now(), name, capital, price });
        uiAlert('Produk berhasil ditambahkan!');
        document.getElementById('prod-name').value = '';
        document.getElementById('prod-capital').value = '';
        document.getElementById('prod-price').value = '';
    }
    
    await idbSet('pos_products', products);
    renderProducts();
    renderKasirProducts();
}

function triggerEditProduct(id) {
    const p = products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-capital').value = p.capital || 0;
    document.getElementById('prod-price').value = p.price;
    editProductId = id;
    
    document.getElementById('form-product-title').innerText = "Edit Produk";
    document.getElementById('btn-add-product').innerHTML = '<i class="fa-solid fa-save"></i> Simpan Perubahan';
    document.getElementById('btn-cancel-edit').style.display = 'block';
    
    document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editProductId = null;
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-capital').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('form-product-title').innerText = "Tambah Produk Digital";
    document.getElementById('btn-add-product').innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Produk';
    document.getElementById('btn-cancel-edit').style.display = 'none';
}

async function deleteProduct(id) {
    if(await uiConfirm('Hapus produk ini dari gudang?')){
        products = products.filter(p => p.id !== id);
        await idbSet('pos_products', products);
        if(editProductId === id) cancelEdit();
        renderProducts();
        renderKasirProducts();
    }
}

function renderProducts() {
    const keyword = document.getElementById('search-produk').value.toLowerCase();
    const list = document.getElementById('product-list');
    const filtered = products.filter(p => p.name.toLowerCase().includes(keyword));
    
    list.innerHTML = filtered.length === 0 ? '<p style="text-align:center; color:gray;">Produk tidak ditemukan</p>' : '';
    filtered.forEach(p => {
        list.innerHTML += `
            <div class="list-item">
                <div class="list-item-info">
                    <h4>${p.name}</h4>
                    <p>Modal: ${formatRp(p.capital || 0)} | Jual: <strong style="color:var(--primary)">${formatRp(p.price)}</strong></p>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-small btn-edit" onclick="triggerEditProduct(${p.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-danger btn-small" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

// ================= MANAJEMEN BON / HUTANG =================
async function saveBon() {
    const tglRaw = document.getElementById('bon-tgl').value;
    const nama = document.getElementById('bon-nama').value;
    const produk = document.getElementById('bon-produk').value;
    const harga = parseInt(document.getElementById('bon-harga').value);

    if(!tglRaw || !nama || !produk || !harga || isNaN(harga)) return uiAlert('Semua isian bon wajib diisi!');

    const [y, m, d] = tglRaw.split('-');
    const tgl = `${d}/${m}/${y}`;

    if(editBonId) {
        const idx = bonData.findIndex(b => b.id === editBonId);
        if(idx !== -1) {
            bonData[idx] = { ...bonData[idx], tglRaw, tgl, nama, produk, harga, sisa: harga - bonData[idx].dibayar };
            uiAlert('Data bon berhasil diperbarui!');
        }
        cancelEditBon();
    } else {
        bonData.push({ id: Date.now(), tglRaw, tgl, nama, produk, harga, dibayar: 0, sisa: harga });
        uiAlert('Bon berhasil ditambahkan!');
        document.getElementById('bon-tgl').value = '';
        document.getElementById('bon-nama').value = '';
        document.getElementById('bon-produk').value = '';
        document.getElementById('bon-harga').value = '';
    }
    await idbSet('pos_bon', bonData);
    renderBon();
}

function triggerEditBon(id) {
    const b = bonData.find(x => x.id === id);
    if(!b) return;
    editBonId = id;
    document.getElementById('bon-tgl').value = b.tglRaw || '';
    document.getElementById('bon-nama').value = b.nama;
    document.getElementById('bon-produk').value = b.produk;
    document.getElementById('bon-harga').value = b.harga;

    document.getElementById('form-bon-title').innerText = "Edit Data Bon";
    document.getElementById('btn-add-bon').innerHTML = '<i class="fa-solid fa-save"></i> Simpan Perubahan';
    document.getElementById('btn-cancel-edit-bon').style.display = 'block';
}

function cancelEditBon() {
    editBonId = null;
    document.getElementById('bon-tgl').value = '';
    document.getElementById('bon-nama').value = '';
    document.getElementById('bon-produk').value = '';
    document.getElementById('bon-harga').value = '';
    document.getElementById('form-bon-title').innerText = "Catat Bon Baru";
    document.getElementById('btn-add-bon').innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Bon';
    document.getElementById('btn-cancel-edit-bon').style.display = 'none';
}

async function deleteBon(id) {
    if(await uiConfirm('Yakin hapus data bon pelanggan ini?')){
        bonData = bonData.filter(b => b.id !== id);
        await idbSet('pos_bon', bonData);
        renderBon();
    }
}

function renderBon() {
    const kw = document.getElementById('search-bon').value.toLowerCase();
    const tbody = document.getElementById('bon-list');
    const filtered = bonData.filter(b => b.nama.toLowerCase().includes(kw) || b.produk.toLowerCase().includes(kw));

    tbody.innerHTML = filtered.length === 0 ? '<tr><td colspan="9" style="text-align:center; color:gray;">Tidak ada data bon ditemukan</td></tr>' : '';

    filtered.forEach((b, i) => {
        const statusHTML = b.sisa <= 0 ? '<span class="bon-status lunas">Lunas</span>' : '<span class="bon-status belum">Belum</span>';
        tbody.innerHTML += `
            <tr>
                <td>${i + 1}</td>
                <td>${b.tgl}</td>
                <td>${b.nama}</td>
                <td>${b.produk}</td>
                <td>${formatRp(b.harga)}</td>
                <td>${formatRp(b.dibayar)}</td>
                <td>${formatRp(b.sisa)}</td>
                <td>${statusHTML}</td>
                <td>
                    <div style="display:flex; gap:5px; justify-content:center;">
                        <button class="btn-success btn-small" onclick="openPayBon(${b.id})"><i class="fa-solid fa-money-bill"></i> Bayar/Cicil</button>
                        <button class="btn-warning btn-small" style="color:white;" onclick="triggerEditBon(${b.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-danger btn-small" onclick="deleteBon(${b.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function openPayBon(id) {
    payBonId = id;
    const b = bonData.find(x => x.id === id);
    if(!b) return;
    document.getElementById('bayar-bon-name').innerText = `Tagihan: ${b.nama} | Sisa: ${formatRp(b.sisa)}`;
    document.getElementById('input-bayar-bon').value = '';
    document.getElementById('modal-bayar-bon').style.display = 'flex';
}

async function processPayBon() {
    const amt = parseInt(document.getElementById('input-bayar-bon').value);
    if(!amt || isNaN(amt) || amt <= 0) return uiAlert('Jumlah pembayaran tidak valid!');
    const idx = bonData.findIndex(x => x.id === payBonId);
    if(idx !== -1) {
        bonData[idx].dibayar += amt;
        bonData[idx].sisa = bonData[idx].harga - bonData[idx].dibayar;
        if(bonData[idx].sisa < 0) bonData[idx].sisa = 0; 
        await idbSet('pos_bon', bonData);
        uiAlert('Pembayaran bon berhasil dicatat!');
        renderBon();
    }
    closeModal('modal-bayar-bon');
}

// ================= KASIR & KERANJANG =================
function renderKasirProducts() {
    const keyword = document.getElementById('search-kasir').value.toLowerCase();
    const grid = document.getElementById('kasir-products');
    const filtered = products.filter(p => p.name.toLowerCase().includes(keyword));
    
    grid.innerHTML = filtered.length === 0 ? '<p style="grid-column: span 2; text-align:center; color:gray;">Tidak ada produk</p>' : '';
    filtered.forEach(p => {
        grid.innerHTML += `
            <div class="product-item" onclick="addToCart(${p.id})">
                <h4>${p.name}</h4>
                <p>${formatRp(p.price)}</p>
            </div>
        `;
    });
}

function addToCart(id) {
    const product = products.find(p => p.id === id);
    const exist = cart.find(c => c.id === id);
    if(exist) {
        exist.qty++;
        exist.subtotal = exist.qty * exist.price;
        exist.capitalSubtotal = exist.qty * (exist.capital || 0);
    } else {
        cart.push({ ...product, qty: 1, subtotal: product.price, capitalSubtotal: product.capital || 0, note: '' });
    }
    renderCart();
}

function updateCartNote(id, noteValue) {
    const item = cart.find(c => c.id === id);
    if(item) item.note = noteValue;
}

function removeFromCart(id) { cart = cart.filter(c => c.id !== id); renderCart(); }

function renderCart() {
    const list = document.getElementById('cart-items');
    let total = 0;
    list.innerHTML = cart.length === 0 ? '<p style="text-align:center; color:gray; font-size:0.8rem;">Keranjang kosong</p>' : '';
    
    cart.forEach(c => {
        total += c.subtotal;
        list.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-header">
                    <div class="cart-item-info">
                        <h5>${c.name}</h5>
                        <p>${formatRp(c.price)}</p>
                    </div>
                    <div class="cart-item-price">
                        <h5 style="margin-bottom:5px;">${formatRp(c.subtotal)}</h5>
                        <button class="btn-danger btn-small" style="float: right;" onclick="removeFromCart(${c.id})"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <input type="text" class="cart-note-input" placeholder="Catatan (Cth: ID Game / No HP)" value="${c.note || ''}" onchange="updateCartNote(${c.id}, this.value)">
            </div>
        `;
    });
    document.getElementById('cart-total-price').innerText = formatRp(total);
}

// ================= TRANSAKSI & NOTA =================
function generateTrxId(dateObj) {
    const pad = (n) => String(n).padStart(2, '0');
    const random4 = Math.floor(1000 + Math.random() * 9000);
    return `${storeData.initials}${pad(dateObj.getDate())}${pad(dateObj.getMonth()+1)}${dateObj.getFullYear()}${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}${pad(dateObj.getSeconds())}${random4}`;
}

async function processCheckout() {
    if(cart.length === 0) return uiAlert('Keranjang masih kosong!');
    
    const customDateInput = document.getElementById('custom-trx-date').value;
    const trxDateObj = customDateInput ? new Date(customDateInput) : new Date();
    
    const trxId = generateTrxId(trxDateObj);
    
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(trxDateObj.getDate())}/${pad(trxDateObj.getMonth()+1)}/${trxDateObj.getFullYear()} ${pad(trxDateObj.getHours())}.${pad(trxDateObj.getMinutes())} WIB`;
    
    const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const totalCapital = cart.reduce((sum, item) => sum + item.capitalSubtotal, 0);
    const profit = total - totalCapital;
    
    const trxData = { id: trxId, date: dateStr, items: [...cart], total: total, profit: profit };
    
    historyTrx.unshift(trxData);
    
    historyTrx.sort((a, b) => {
        const parseIndoDate = (dStr) => {
            const parts = dStr.replace(' WIB', '').split(' ');
            if (parts.length < 2) return new Date().getTime(); 
            const [d, m, y] = parts[0].split('/');
            const hm = parts[1].split('.');
            return new Date(y, m-1, d, hm[0] || '0', hm[1] || '0', 0).getTime();
        };
        return parseIndoDate(b.date) - parseIndoDate(a.date);
    });

    await idbSet('pos_history', historyTrx);
    
    buildReceiptDOM(trxData);
    
    cart = []; 
    document.getElementById('search-kasir').value = ''; 
    document.getElementById('custom-trx-date').value = ''; 
    renderKasirProducts(); 
    renderCart(); 
    renderHistoryAndChart();
}

function buildReceiptDOM(trxData) {
    const rLogo = document.getElementById('r-logo');
    if (storeData.logo) {
        rLogo.src = storeData.logo;
        rLogo.style.display = 'block';
    } else {
        rLogo.style.display = 'none';
    }

    document.getElementById('r-store-name').innerText = storeData.name || 'NAMA TOKO';
    document.getElementById('r-contact').innerText = storeData.contact || '';
    document.getElementById('r-address').innerText = storeData.address || '';
    
    document.getElementById('r-trx-id').innerText = trxData.id;
    document.getElementById('r-date').innerText = trxData.date;
    document.getElementById('r-cashier').innerText = storeData.cashier || '-';
    document.getElementById('r-payment').innerText = storeData.payment || '-';
    document.getElementById('r-footer').innerText = storeData.footer || '';
    
    let rItemsHTML = '';
    trxData.items.forEach(item => {
        rItemsHTML += `
            <tr>
                <td align="left" style="padding-top: 5px; padding-bottom: 2px; font-family: Arial, Helvetica, sans-serif !important;">${item.name}</td>
                <td align="right" style="padding-top: 5px; padding-bottom: 2px; font-family: Arial, Helvetica, sans-serif !important;">${formatRp(item.subtotal)}</td>
            </tr>
        `;
        if(item.note) {
            rItemsHTML += `<tr><td colspan="2" style="font-size: 11px; color: #777777; padding-bottom: 5px; font-family: Arial, Helvetica, sans-serif !important;">${item.note}</td></tr>`;
        }
    });
    
    document.getElementById('r-items-table').innerHTML = rItemsHTML;
    
    const totalStr = formatRp(trxData.total);
    document.getElementById('r-total').innerText = totalStr;
    document.getElementById('r-bayar').innerText = totalStr;

    setTimeout(() => {
        html2canvas(document.getElementById('receipt-canvas'), { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            document.getElementById('img-nota-result').src = imgData;
            document.getElementById('modal-nota').style.display = 'flex';
            document.getElementById('btn-share-wa').onclick = () => shareToWhatsApp(imgData, trxData);
        });
    }, 150);
}

function rePrint(trxId) {
    const trxData = historyTrx.find(t => t.id === trxId);
    if(trxData) buildReceiptDOM(trxData);
}

// ================= EDIT & HAPUS RIWAYAT =================
function openEditRiwayat(id) {
    const t = historyTrx.find(x => x.id === id);
    if(!t) return;
    editRiwayatId = id;
    document.getElementById('edit-riwayat-tgl').value = t.date;
    document.getElementById('edit-riwayat-total').value = t.total;
    document.getElementById('edit-riwayat-profit').value = t.profit || 0;
    document.getElementById('modal-edit-riwayat').style.display = 'flex';
}

async function saveEditRiwayat() {
    const tgl = document.getElementById('edit-riwayat-tgl').value;
    const total = parseInt(document.getElementById('edit-riwayat-total').value);
    const profit = parseInt(document.getElementById('edit-riwayat-profit').value);

    if(!tgl || isNaN(total) || isNaN(profit)) return uiAlert('Data isian tidak valid!');

    const idx = historyTrx.findIndex(x => x.id === editRiwayatId);
    if(idx !== -1) {
        historyTrx[idx].date = tgl;
        historyTrx[idx].total = total;
        historyTrx[idx].profit = profit;

        historyTrx.sort((a, b) => {
            const parseIndoDate = (dStr) => {
                const parts = dStr.replace(' WIB', '').split(' ');
                if (parts.length < 2) return new Date().getTime(); 
                const [d, m, y] = parts[0].split('/');
                const hm = parts[1].split('.');
                return new Date(y, m-1, d, hm[0] || '0', hm[1] || '0', 0).getTime();
            };
            return parseIndoDate(b.date) - parseIndoDate(a.date);
        });

        await idbSet('pos_history', historyTrx);
        uiAlert('Data riwayat berhasil diperbarui!');
        renderHistoryAndChart();
    }
    closeModal('modal-edit-riwayat');
}

async function deleteRiwayat(id) {
    if(await uiConfirm('Yakin hapus data riwayat transaksi ini?')){
        historyTrx = historyTrx.filter(t => t.id !== id);
        await idbSet('pos_history', historyTrx);
        uiAlert('Data riwayat berhasil dihapus!');
        renderHistoryAndChart();
    }
}

// ================= SHARE WHATSAPP PURE IMAGE =================
async function shareToWhatsApp(dataUrl, trxData) {
    try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `Nota_${trxData.id}.png`, { type: blob.type });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] }); 
        } else {
            const link = document.createElement('a'); 
            link.href = dataUrl; 
            link.download = `Nota_${trxData.id}.png`; 
            link.click();
            uiAlert("Gambar nota berhasil diunduh. Silakan lampirkan gambar secara manual di obrolan WhatsApp.");
        }
    } catch (err) { uiAlert("Gagal membagikan otomatis. Gambar nota telah diunduh."); }
}

// ================= LAPORAN (CHART & FILTER) =================
function getGroupedDateKey(dateStr, filter) {
    const datePart = dateStr.split(' ')[0].trim();
    const parts = datePart.split('/');
    if(parts.length !== 3) return datePart; 
    
    const [d, m, y] = parts;
    if(filter === 'daily') return `${d}/${m}/${y}`;
    if(filter === 'monthly') return `${m}/${y}`;
    if(filter === 'yearly') return `${y}`;
    return datePart;
}

function renderHistoryAndChart() {
    const filter = document.getElementById('filter-laporan').value;
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#f3f4f6' : '#374151';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    const list = document.getElementById('history-list');
    list.innerHTML = historyTrx.length === 0 ? '<p style="text-align:center; color:gray;">Belum ada riwayat transaksi</p>' : '';
    
    historyTrx.forEach(t => {
        const profit = t.profit || 0; 
        list.innerHTML += `
            <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                <div style="display:flex; justify-content:space-between; width:100%; border-bottom: 1px dashed var(--border); padding-bottom:5px;">
                    <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">${t.id}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${t.date}</span>
                </div>
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div>
                        <h4 style="color:var(--text-main); margin:0;">${formatRp(t.total)}</h4>
                        <span style="font-size:0.75rem; color:var(--success);">Laba: ${formatRp(profit)}</span>
                    </div>
                    
                    <div style="display:flex; gap: 5px;">
                        <button class="btn-warning btn-small" style="color: white;" onclick="openEditRiwayat('${t.id}')">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button class="btn-danger btn-small" onclick="deleteRiwayat('${t.id}')">
                            <i class="fa-solid fa-trash"></i> Hapus
                        </button>
                        <button class="btn-primary btn-small" onclick="rePrint('${t.id}')">
                            <i class="fa-solid fa-receipt"></i> Nota
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    const groupedData = {};
    const chartData = [...historyTrx].reverse(); 
    
    let totalOmsetFiltered = 0;
    let totalProfitFiltered = 0;

    chartData.forEach(t => {
        const key = getGroupedDateKey(t.date, filter);
        if(!groupedData[key]) groupedData[key] = { omset: 0, profit: 0 };
        groupedData[key].omset += t.total;
        groupedData[key].profit += (t.profit || 0);
        
        totalOmsetFiltered += t.total;
        totalProfitFiltered += (t.profit || 0);
    });

    document.getElementById('rekap-summary').innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
            <span style="color:var(--text-muted); font-size:0.9rem;">Total Omzet:</span>
            <span style="font-weight:bold; color:var(--text-main);">${formatRp(totalOmsetFiltered)}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted); font-size:0.9rem;">Total Laba:</span>
            <span style="font-weight:bold; color:var(--success);">${formatRp(totalProfitFiltered)}</span>
        </div>
    `;

    const labels = Object.keys(groupedData);
    const dataOmset = labels.map(k => groupedData[k].omset);

    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChartInst) salesChartInst.destroy();
    
    salesChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Omzet Penjualan (Rp)',
                data: dataOmset,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 4,
                maxBarThickness: 35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: textColor } } },
            scales: { 
                y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
                x: { ticks: { color: textColor }, grid: { display: false } }
            }
        }
    });
}
