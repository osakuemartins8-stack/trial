// ==========================================
// ADMIN DASHBOARD - Standalone Page Version
// ==========================================

const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration not loaded');
    alert('Configuration error');
    throw new Error('No Supabase config');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let allProducts = [];
let orders = [];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatPrice(price) {
    return '$' + parseFloat(price).toFixed(2);
}

// ==========================================
// AUTHENTICATION - Fixed for Admin Page
// ==========================================

async function checkAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (!session) {
            console.log('No session found, showing login');
            showLoginScreen();
            return;
        }
        
        currentUser = session.user;
        console.log('Logged in as:', currentUser.email);
        
        // Check if admin
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .single();
        
        if (roleError || !roleData || roleData.role !== 'admin') {
            showToast('Access denied: Not an admin', 'error');
            await supabase.auth.signOut();
            showLoginScreen();
            return;
        }
        
        // Update UI safely
        updateAdminUI();
        
        // Hide login, show dashboard
        document.getElementById('admin-login-screen').style.display = 'none';
        document.getElementById('loading-screen').style.display = 'none';
        document.querySelector('.sidebar').style.display = 'flex';
        document.querySelector('.main-content').style.display = 'block';
        
        // Load dashboard data
        loadDashboardData();
        
    } catch (error) {
        console.error('Auth check error:', error);
        showLoginScreen();
    }
}

function updateAdminUI() {
    // Update sidebar user info safely
    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userAvatarEl = document.getElementById('user-avatar');
    
    if (userNameEl && currentUser?.user_metadata?.full_name) {
        userNameEl.textContent = currentUser.user_metadata.full_name;
    } else if (userNameEl && currentUser?.email) {
        userNameEl.textContent = currentUser.email.split('@')[0];
    }
    
    if (userEmailEl && currentUser?.email) {
        userEmailEl.textContent = currentUser.email;
    }
    
    if (userAvatarEl && currentUser?.email) {
        userAvatarEl.textContent = currentUser.email.substring(0, 2).toUpperCase();
    }
}

function showLoginScreen() {
    document.getElementById('admin-login-screen').style.display = 'flex';
    document.getElementById('loading-screen').style.display = 'none';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
}

// ==========================================
// LOGIN/LOGOUT HANDLERS
// ==========================================

async function handleAdminLogin(email, password) {
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-btn-text');
    const btnSpinner = document.getElementById('login-btn-spinner');
    const errorEl = document.getElementById('login-error');
    
    try {
        btn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnSpinner) btnSpinner.style.display = 'inline';
        if (errorEl) errorEl.style.display = 'none';
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        
        // Check admin status
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .single();
        
        if (roleError || !roleData || roleData.role !== 'admin') {
            await supabase.auth.signOut();
            throw new Error('Not authorized as admin');
        }
        
        showToast('Welcome, Admin!', 'success');
        
        // Show dashboard
        document.getElementById('admin-login-screen').style.display = 'none';
        document.querySelector('.sidebar').style.display = 'flex';
        document.querySelector('.main-content').style.display = 'block';
        
        updateAdminUI();
        loadDashboardData();
        
    } catch (error) {
        console.error('Login error:', error);
        if (errorEl) {
            errorEl.textContent = error.message;
            errorEl.style.display = 'block';
        }
    } finally {
        btn.disabled = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
    }
}

async function handleLogout() {
    try {
        await supabase.auth.signOut();
        currentUser = null;
        showLoginScreen();
        showToast('Logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ==========================================
// DASHBOARD DATA LOADING
// ==========================================

async function loadDashboardData() {
    try {
        await Promise.all([
            loadDashboardStats(),
            loadAdminProducts(),
            loadAdminOrders()
        ]);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadDashboardStats() {
    // Load counts
    try {
        const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });
            
        const { count: orderCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });
        
        const revenueEl = document.getElementById('total-revenue');
        const ordersEl = document.getElementById('total-orders');
        const productsEl = document.getElementById('total-products');
        
        if (revenueEl) revenueEl.textContent = '$0'; // Calculate from orders
        if (ordersEl) ordersEl.textContent = orderCount || 0;
        if (productsEl) productsEl.textContent = productCount || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadAdminProducts() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;
    
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allProducts = data || [];
        
        if (allProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No products yet. Add your first product!</td></tr>';
            return;
        }
        
        tbody.innerHTML = allProducts.map(product => `
            <tr>
                <td><img src="${product.image_url}" alt="${product.name}" class="product-img"></td>
                <td>${product.name}</td>
                <td>${product.sku}</td>
                <td>${product.category}</td>
                <td>${formatPrice(product.price)}</td>
                <td>${product.stock}</td>
                <td><span class="status-badge ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}">${product.stock > 0 ? 'In Stock' : 'Out of Stock'}</span></td>
                <td>
                    <button class="action-btn" onclick="editProduct('${product.id}')">Edit</button>
                    <button class="action-btn delete" onclick="deleteProduct('${product.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading products:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error: ${error.message}</td></tr>`;
    }
}

async function loadAdminOrders() {
    const tbody = document.getElementById('orders-tbody');
    const recentTbody = document.getElementById('recent-orders-tbody');
    
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        orders = data || [];
        
        const renderRow = (order) => `
            <tr>
                <td>#${order.id.slice(0, 8)}</td>
                <td>${order.customer_email || 'Guest'}</td>
                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                <td>${formatPrice(order.total)}</td>
                <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                <td><button class="action-btn" onclick="viewOrder('${order.id}')">View</button></td>
            </tr>
        `;
        
        if (tbody) {
            tbody.innerHTML = orders.length ? orders.map(renderRow).join('') : '<tr><td colspan="6" class="empty-state">No orders yet</td></tr>';
        }
        
        if (recentTbody) {
            recentTbody.innerHTML = orders.slice(0, 5).map(renderRow).join('') || '<tr><td colspan="6" class="empty-state">No recent orders</td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error loading orders</td></tr>`;
    }
}

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================

function openProductModal(productId = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('product-modal-title');
    
    if (!modal) return;
    
    if (productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;
        
        title.textContent = 'Edit Product';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-sku').value = product.sku;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-stock').value = product.stock;
        document.getElementById('product-featured').value = product.featured ? 'true' : 'false';
        document.getElementById('product-image').value = product.image_url || '';
        
        // Check sizes
        document.querySelectorAll('input[name="sizes"]').forEach(cb => {
            cb.checked = product.sizes && product.sizes.includes(cb.value);
        });
    } else {
        title.textContent = 'Add Product';
        form.reset();
        document.getElementById('product-id').value = '';
    }
    
    modal.classList.add('active');
}

function closeProductModal() {
    document.getElementById('product-modal')?.classList.remove('active');
}

async function saveProduct(e) {
    e.preventDefault();
    
    const productId = document.getElementById('product-id').value;
    const sizes = Array.from(document.querySelectorAll('input[name="sizes"]:checked')).map(cb => cb.value);
    
    const productData = {
        name: document.getElementById('product-name').value,
        sku: document.getElementById('product-sku').value,
        description: document.getElementById('product-description').value,
        category: document.getElementById('product-category').value,
        price: parseFloat(document.getElementById('product-price').value),
        stock: parseInt(document.getElementById('product-stock').value),
        featured: document.getElementById('product-featured').value === 'true',
        image_url: document.getElementById('product-image').value,
        sizes: sizes
    };
    
    try {
        if (productId) {
            const { error } = await supabase
                .from('products')
                .update(productData)
                .eq('id', productId);
            if (error) throw error;
            showToast('Product updated successfully');
        } else {
            const { error } = await supabase
                .from('products')
                .insert(productData);
            if (error) throw error;
            showToast('Product added successfully');
        }
        
        closeProductModal();
        loadAdminProducts();
        
    } catch (error) {
        console.error('Error saving product:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', productId);
        
        if (error) throw error;
        showToast('Product deleted');
        loadAdminProducts();
    } catch (error) {
        showToast('Error deleting product', 'error');
    }
}

function viewOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    alert(`Order #${order.id.slice(0, 8)}\nTotal: ${formatPrice(order.total)}\nStatus: ${order.status}\nDate: ${new Date(order.created_at).toLocaleString()}`);
}

// ==========================================
// NAVIGATION
// ==========================================

function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    // Show selected
    const target = document.getElementById(`${pageName}-page`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) item.classList.add('active');
    });
    
    document.getElementById('page-title').textContent = pageName.charAt(0).toUpperCase() + pageName.slice(1);
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check auth first
    checkAuth();
    
    // Login form
    document.getElementById('admin-login-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        handleAdminLogin(email, password);
    });
    
    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(item.dataset.page);
        });
    });
    
    // Add product button
    document.getElementById('add-product-btn')?.addEventListener('click', () => openProductModal());
    
    // Modal close buttons
    document.querySelectorAll('.modal-close, #cancel-product-btn').forEach(btn => {
        btn?.addEventListener('click', closeProductModal);
    });
    
    // Product form
    document.getElementById('product-form')?.addEventListener('submit', saveProduct);
    
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay?.addEventListener('click', () => {
            overlay.closest('.modal')?.classList.remove('active');
        });
    });
    
    // Mobile menu toggle
    document.getElementById('menu-toggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
    });
});

// Global exports
window.editProduct = openProductModal;
window.deleteProduct = deleteProduct;
window.viewOrder = viewOrder;
