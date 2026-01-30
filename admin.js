// Wrap everything to prevent redeclaration errors
(function() {
'use strict';

// ==========================================
// ADMIN DASHBOARD - Standalone Page
// ==========================================

// Check if already initialized
if (window.threadlineAdminInitialized) {
    console.log('Admin already initialized, skipping...');
    return;
}
window.threadlineAdminInitialized = true;

// Get config safely
const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration not loaded. Make sure config.js is loaded before admin.js');
    alert('Configuration error: Supabase not configured');
    return;
}

// Check if Supabase library loaded
if (!window.supabase) {
    console.error('Supabase library not loaded');
    alert('Error: Supabase library not loaded. Check internet connection.');
    return;
}

// Create client (scoped to this IIFE, so no global conflict)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let allProducts = [];
let orders = [];

// Expose to window for debugging if needed, but only if not already set
if (!window.adminSupabase) {
    window.adminSupabase = supabaseClient;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Remove existing toasts if too many
    while (container.children.length > 3) {
        container.removeChild(container.firstChild);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatPrice(price) {
    return '$' + parseFloat(price).toFixed(2);
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function checkAuth() {
    try {
        console.log('Checking auth...');
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Session error:', error);
            showLoginScreen();
            return;
        }
        
        if (!session) {
            console.log('No session found');
            showLoginScreen();
            return;
        }
        
        currentUser = session.user;
        console.log('Authenticated as:', currentUser.email);
        
        // Verify admin status
        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .single();
        
        if (roleError) {
            console.error('Role check error:', roleError);
            showToast('Error checking permissions', 'error');
            await supabaseClient.auth.signOut();
            showLoginScreen();
            return;
        }
        
        if (!roleData || roleData.role !== 'admin') {
            console.warn('User is not admin:', roleData);
            showToast('Access denied: Admin privileges required', 'error');
            await supabaseClient.auth.signOut();
            showLoginScreen();
            return;
        }
        
        console.log('Admin verified');
        showDashboard();
        
    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginScreen();
    }
}

function showLoginScreen() {
    console.log('Showing login screen');
    const loginScreen = document.getElementById('admin-login-screen');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (loginScreen) loginScreen.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    
    // Hide loading if present
    const loading = document.getElementById('loading-screen');
    if (loading) loading.style.display = 'none';
}

function showDashboard() {
    console.log('Showing dashboard');
    const loginScreen = document.getElementById('admin-login-screen');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (sidebar) sidebar.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    
    // Update user info safely
    updateAdminUI();
    
    // Load data
    loadDashboardData();
}

function updateAdminUI() {
    if (!currentUser) return;
    
    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userAvatarEl = document.getElementById('user-avatar');
    
    if (userNameEl) {
        userNameEl.textContent = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Admin';
    }
    
    if (userEmailEl) {
        userEmailEl.textContent = currentUser.email || '';
    }
    
    if (userAvatarEl) {
        const initials = currentUser.email ? currentUser.email.substring(0, 2).toUpperCase() : 'AD';
        userAvatarEl.textContent = initials;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-btn-text');
    const btnSpinner = document.getElementById('login-btn-spinner');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Show loading state
    if (btn) btn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnSpinner) btnSpinner.style.display = 'inline';
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
    
    try {
        console.log('Attempting login for:', email);
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        console.log('Login successful, checking admin role...');
        
        // Check admin role
        const { data: roleData, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .single();
        
        if (roleError || !roleData || roleData.role !== 'admin') {
            await supabaseClient.auth.signOut();
            throw new Error('Not authorized as admin');
        }
        
        showToast('Welcome, Admin!', 'success');
        showDashboard();
        
    } catch (error) {
        console.error('Login error:', error);
        if (errorEl) {
            errorEl.textContent = error.message || 'Invalid credentials';
            errorEl.style.display = 'block';
        }
    } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnSpinner) btnSpinner.style.display = 'none';
    }
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        showToast('Logged out successfully');
        showLoginScreen();
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
}

// ==========================================
// DATA LOADING
// ==========================================

async function loadDashboardData() {
    try {
        await Promise.all([
            loadDashboardStats(),
            loadProducts(),
            loadOrders()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadDashboardStats() {
    try {
        // Get counts
        const { count: productCount, error: prodError } = await supabaseClient
            .from('products')
            .select('*', { count: 'exact', head: true });
            
        const { count: orderCount, error: orderError } = await supabaseClient
            .from('orders')
            .select('*', { count: 'exact', head: true });
        
        // Calculate revenue
        const { data: paidOrders, error: revError } = await supabaseClient
            .from('orders')
            .select('total')
            .eq('payment_status', 'paid');
        
        const totalRevenue = paidOrders?.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;
        
        // Update DOM
        const revenueEl = document.getElementById('total-revenue');
        const ordersEl = document.getElementById('total-orders');
        const productsEl = document.getElementById('total-products');
        const customersEl = document.getElementById('total-customers');
        
        if (revenueEl) revenueEl.textContent = formatPrice(totalRevenue);
        if (ordersEl) ordersEl.textContent = orderCount || 0;
        if (productsEl) productsEl.textContent = productCount || 0;
        if (customersEl) customersEl.textContent = paidOrders?.length || 0; // Approximation
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadProducts() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Loading products...</td></tr>';
    
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allProducts = data || [];
        
        if (allProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No products yet. Add your first product!</td></tr>';
            return;
        }
        
        tbody.innerHTML = allProducts.map(product => {
            const stockStatus = product.stock === 0 ? 'out-of-stock' : (product.stock < 10 ? 'low-stock' : 'in-stock');
            const stockLabel = product.stock === 0 ? 'Out of Stock' : (product.stock < 10 ? 'Low Stock' : 'In Stock');
            
            return `
            <tr>
                <td><img src="${product.image_url}" alt="${product.name}" class="product-img" onerror="this.src='https://via.placeholder.com/50x60?text=No+Image'"></td>
                <td><strong>${product.name}</strong></td>
                <td>${product.sku}</td>
                <td><span class="status-badge status-${product.category}">${product.category}</span></td>
                <td>${formatPrice(product.price)}</td>
                <td>${product.stock}</td>
                <td><span class="status-badge ${stockStatus}">${stockLabel}</span></td>
                <td>
                    <button class="action-btn" onclick="window.editProduct('${product.id}')">Edit</button>
                    <button class="action-btn delete" onclick="window.deleteProduct('${product.id}')">Delete</button>
                </td>
            </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading products:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color: red;">Error: ${error.message}</td></tr>`;
    }
}

async function loadOrders() {
    const tbody = document.getElementById('orders-tbody');
    const recentTbody = document.getElementById('recent-orders-tbody');
    
    try {
        const { data, error } = await supabaseClient
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
                <td><span class="status-badge status-${order.status || 'pending'}">${order.status || 'pending'}</span></td>
                <td>
                    <button class="action-btn" onclick="window.viewOrder('${order.id}')">View</button>
                </td>
            </tr>
        `;
        
        if (tbody) {
            tbody.innerHTML = orders.length ? orders.map(renderRow).join('') : '<tr><td colspan="6" class="empty-state">No orders yet</td></tr>';
        }
        
        if (recentTbody) {
            recentTbody.innerHTML = orders.slice(0, 5).length ? orders.slice(0, 5).map(renderRow).join('') : '<tr><td colspan="6" class="empty-state">No recent orders</td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${error.message}</td></tr>`;
    }
}

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================

window.editProduct = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    
    if (title) title.textContent = 'Edit Product';
    if (document.getElementById('product-id')) document.getElementById('product-id').value = product.id;
    if (document.getElementById('product-name')) document.getElementById('product-name').value = product.name;
    if (document.getElementById('product-sku')) document.getElementById('product-sku').value = product.sku;
    if (document.getElementById('product-description')) document.getElementById('product-description').value = product.description || '';
    if (document.getElementById('product-category')) document.getElementById('product-category').value = product.category;
    if (document.getElementById('product-price')) document.getElementById('product-price').value = product.price;
    if (document.getElementById('product-stock')) document.getElementById('product-stock').value = product.stock;
    if (document.getElementById('product-featured')) document.getElementById('product-featured').value = product.featured ? 'true' : 'false';
    if (document.getElementById('product-image')) document.getElementById('product-image').value = product.image_url || '';
    
    // Check size boxes
    document.querySelectorAll('input[name="sizes"]').forEach(cb => {
        cb.checked = product.sizes && product.sizes.includes(cb.value);
    });
    
    if (modal) modal.classList.add('active');
};

window.deleteProduct = async function(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', productId);
        
        if (error) throw error;
        
        showToast('Product deleted successfully');
        loadProducts();
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Error deleting product: ' + error.message, 'error');
    }
};

window.viewOrder = function(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const items = order.items || [];
    const itemsList = items.map(i => `• ${i.name} (${i.size}) x${i.quantity} - ${formatPrice(i.price)}`).join('\n');
    
    alert(`Order Details\n\nID: #${order.id.slice(0, 8)}\nStatus: ${order.status || 'pending'}\nTotal: ${formatPrice(order.total)}\nDate: ${new Date(order.created_at).toLocaleString()}\n\nItems:\n${itemsList || 'No items'}`);
};

function openAddProductModal() {
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    const form = document.getElementById('product-form');
    
    if (title) title.textContent = 'Add Product';
    if (form) form.reset();
    if (document.getElementById('product-id')) document.getElementById('product-id').value = '';
    
    // Uncheck all sizes
    document.querySelectorAll('input[name="sizes"]').forEach(cb => cb.checked = false);
    
    if (modal) modal.classList.add('active');
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('active');
}

async function saveProduct(e) {
    e.preventDefault();
    
    const productId = document.getElementById('product-id')?.value;
    const sizes = Array.from(document.querySelectorAll('input[name="sizes"]:checked')).map(cb => cb.value);
    
    const productData = {
        name: document.getElementById('product-name')?.value,
        sku: document.getElementById('product-sku')?.value,
        description: document.getElementById('product-description')?.value,
        category: document.getElementById('product-category')?.value,
        price: parseFloat(document.getElementById('product-price')?.value || 0),
        stock: parseInt(document.getElementById('product-stock')?.value || 0),
        featured: document.getElementById('product-featured')?.value === 'true',
        image_url: document.getElementById('product-image')?.value,
        sizes: sizes
    };
    
    try {
        if (productId) {
            const { error } = await supabaseClient
                .from('products')
                .update(productData)
                .eq('id', productId);
            if (error) throw error;
            showToast('Product updated successfully');
        } else {
            const { error } = await supabaseClient
                .from('products')
                .insert(productData);
            if (error) throw error;
            showToast('Product added successfully');
        }
        
        closeProductModal();
        loadProducts();
    } catch (error) {
        console.error('Save error:', error);
        showToast('Error: ' + error.message, 'error');
    }
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
    
    // Show target
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
    
    // Update header title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = pageName.charAt(0).toUpperCase() + pageName.slice(1);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin JS loaded');
    
    // Login form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            showPage(this.dataset.page);
        });
    });
    
    // Add product button
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', openAddProductModal);
    }
    
    // Close modal buttons
    document.querySelectorAll('.modal-close, #cancel-product-btn').forEach(btn => {
        if (btn) btn.addEventListener('click', closeProductModal);
    });
    
    // Product form
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', saveProduct);
    }
    
    // Modal overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function() {
            this.closest('.modal')?.classList.remove('active');
        });
    });
    
    // Mobile menu
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            document.querySelector('.sidebar')?.classList.toggle('open');
        });
    }
    
    // Check auth on load
    checkAuth();
});

})();
