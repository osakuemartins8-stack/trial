// Wrap entire script to prevent duplicate declaration errors from live reload
(function() {
'use strict';

// ==========================================
// CONFIGURATION & INITIALIZATION
// ==========================================

// Get Supabase credentials from config file
const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;

// Check if config is loaded
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration not loaded. Make sure config.js is included before app.js');
    alert('Configuration error. Please contact support.');
    return;
}

// Check if Supabase library is loaded
if (!window.supabase) {
    console.error('Supabase library not loaded. Please check your internet connection.');
    return;
}

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let cart = [];
let products = [];
let allProducts = [];
let orders = [];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toast-container');
    if (container) {
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

function formatPrice(price) {
    return '$' + parseFloat(price).toFixed(2);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

async function initializeDatabase() {
    try {
        const { data: existingProducts } = await supabase
            .from('products')
            .select('count');
        
        if (!existingProducts || existingProducts.length === 0) {
            await seedDatabase();
        }
    } catch (error) {
        console.log('Initializing database with sample data...');
        await seedDatabase();
    }
}

async function seedDatabase() {
    const sampleProducts = [
        {
            name: 'Classic Oxford Shirt',
            description: 'Timeless oxford weave shirt perfect for any occasion. Crafted from premium cotton with impeccable attention to detail.',
            price: 89.99,
            category: 'formal',
            image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800',
            sizes: ['S', 'M', 'L', 'XL'],
            stock: 50,
            sku: 'OXF-001',
            featured: true
        },
        {
            name: 'Linen Summer Shirt',
            description: 'Breathable linen shirt perfect for warm days. Lightweight and comfortable with a relaxed fit.',
            price: 75.00,
            category: 'casual',
            image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800',
            sizes: ['S', 'M', 'L', 'XL', 'XXL'],
            stock: 35,
            sku: 'LIN-002',
            featured: true
        },
        {
            name: 'Slim Fit Dress Shirt',
            description: 'Modern slim fit dress shirt with stretch fabric for all-day comfort. Perfect for professional settings.',
            price: 95.00,
            category: 'formal',
            image_url: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800',
            sizes: ['S', 'M', 'L', 'XL'],
            stock: 42,
            sku: 'SLM-003',
            featured: false
        },
        {
            name: 'Flannel Casual Shirt',
            description: 'Cozy flannel shirt with classic pattern. Ideal for casual outings and cooler weather.',
            price: 68.00,
            category: 'casual',
            image_url: 'https://images.unsplash.com/photo-1598032895725-b6b8f3c0d952?w=800',
            sizes: ['M', 'L', 'XL', 'XXL'],
            stock: 28,
            sku: 'FLN-004',
            featured: false
        },
        {
            name: 'Performance Sport Shirt',
            description: 'Technical fabric with moisture-wicking properties. Perfect for active lifestyles.',
            price: 82.00,
            category: 'sport',
            image_url: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800',
            sizes: ['S', 'M', 'L', 'XL'],
            stock: 38,
            sku: 'SPT-005',
            featured: false
        },
        {
            name: 'Premium Cotton Polo',
            description: 'Luxurious cotton polo with refined details. Versatile piece for smart-casual occasions.',
            price: 110.00,
            category: 'premium',
            image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800',
            sizes: ['S', 'M', 'L', 'XL'],
            stock: 25,
            sku: 'POL-006',
            featured: true
        },
        {
            name: 'Denim Western Shirt',
            description: 'Classic western-style denim shirt with snap buttons. Rugged and stylish.',
            price: 85.00,
            category: 'casual',
            image_url: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800',
            sizes: ['M', 'L', 'XL', 'XXL'],
            stock: 30,
            sku: 'DNM-007',
            featured: false
        },
        {
            name: 'Silk Blend Evening Shirt',
            description: 'Elegant silk blend shirt for special occasions. Luxurious feel with subtle sheen.',
            price: 145.00,
            category: 'premium',
            image_url: 'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=800',
            sizes: ['S', 'M', 'L', 'XL'],
            stock: 18,
            sku: 'SLK-008',
            featured: false
        }
    ];

    try {
        const { error } = await supabase
            .from('products')
            .insert(sampleProducts);

        if (error) throw error;
        console.log('Sample products added successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        updateAuthUI();
        await loadCart();
        await checkAdminStatus();
    }
}

async function checkAdminStatus() {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id)
            .single();

        if (!error && data && data.role === 'admin') {
            const adminBtn = document.getElementById('admin-btn');
            if (adminBtn) adminBtn.style.display = 'block';
        }
    } catch (error) {
        console.log('Not an admin user');
    }
}

async function handleLogin(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;
        updateAuthUI();
        await loadCart();
        await checkAdminStatus();
        closeModal('auth-modal');
        showToast('Welcome back!');
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message, 'error');
    }
}

async function handleSignup(name, email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name
                }
            }
        });

        if (error) throw error;

        showToast('Account created! Please check your email to verify your account.');
        closeModal('auth-modal');
    } catch (error) {
        console.error('Signup error:', error);
        showToast(error.message, 'error');
    }
}

async function handleLogout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        currentUser = null;
        cart = [];
        updateAuthUI();
        updateCartUI();
        
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = 'none';
        
        const adminDashboard = document.getElementById('admin-dashboard');
        if (adminDashboard) {
            adminDashboard.style.display = 'none';
            adminDashboard.classList.remove('active');
        }
        
        showToast('Logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
}

function updateAuthUI() {
    const accountBtn = document.getElementById('account-btn');
    if (accountBtn) {
        if (currentUser) {
            accountBtn.setAttribute('aria-label', `Account: ${currentUser.email}`);
        } else {
            accountBtn.setAttribute('aria-label', 'Account');
        }
    }
}

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================

async function loadProducts(filters = {}) {
    try {
        let query = supabase.from('products').select('*');

        if (filters.category) {
            query = query.eq('category', filters.category);
        }

        if (filters.search) {
            query = query.ilike('name', `%${filters.search}%`);
        }

        if (filters.sort === 'price-low') {
            query = query.order('price', { ascending: true });
        } else if (filters.sort === 'price-high') {
            query = query.order('price', { ascending: false });
        } else if (filters.sort === 'popular') {
            query = query.order('featured', { ascending: false });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query;

        if (error) throw error;

        allProducts = data || [];
        
        if (filters.size) {
            products = allProducts.filter(product => 
                product.sizes && product.sizes.includes(filters.size)
            );
        } else {
            products = allProducts;
        }

        displayProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Error loading products', 'error');
    }
}

function displayProducts(productsToDisplay) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    if (!productsToDisplay || productsToDisplay.length === 0) {
        grid.innerHTML = `
            <div class="loading-products">
                <p>No products found</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = productsToDisplay.map(product => `
        <div class="product-card" onclick="openProductModal('${product.id}')">
            <div class="product-image">
                <img src="${product.image_url}" alt="${product.name}" loading="lazy">
                ${product.featured ? '<div class="product-badge">Featured</div>' : ''}
            </div>
            <div class="product-info">
                <div class="product-category">${product.category}</div>
                <h3 class="product-name">${product.name}</h3>
                <div class="product-price">${formatPrice(product.price)}</div>
                <div class="product-stock ${product.stock < 10 ? 'low-stock' : ''}">
                    ${product.stock < 10 ? 'Only ' + product.stock + ' left!' : 'In Stock'}
                </div>
            </div>
        </div>
    `).join('');
}

async function openProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (typeof trackProductView === 'function') {
        trackProductView(productId);
    }

    const modal = document.getElementById('product-modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) return;

    modalBody.innerHTML = `
        <div class="product-modal-grid">
            <div>
                <img src="${product.image_url}" alt="${product.name}" class="product-modal-image">
            </div>
            <div class="product-modal-details">
                <div class="product-category">${product.category.toUpperCase()}</div>
                <h2>${product.name}</h2>
                <div class="product-modal-price">${formatPrice(product.price)}</div>
                <p class="product-modal-description">${product.description}</p>
                
                <div class="product-options">
                    <label class="option-label">Select Size</label>
                    <div class="size-options">
                        ${product.sizes.map(size => `
                            <button class="size-option" data-size="${size}">${size}</button>
                        `).join('')}
                    </div>
                </div>

                <div class="product-options">
                    <label class="option-label">Quantity</label>
                    <div class="quantity-selector">
                        <button class="quantity-btn" onclick="updateModalQuantity(-1)">-</button>
                        <span class="quantity-value" id="modal-quantity">1</span>
                        <button class="quantity-btn" onclick="updateModalQuantity(1)">+</button>
                    </div>
                </div>

                <button class="add-to-cart-btn" onclick="addToCartFromModal('${product.id}')">
                    Add to Cart
                </button>
            </div>
        </div>
    `;

    modalBody.querySelectorAll('.size-option').forEach(btn => {
        btn.addEventListener('click', () => {
            modalBody.querySelectorAll('.size-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const firstSizeBtn = modalBody.querySelector('.size-option');
    if (firstSizeBtn) firstSizeBtn.classList.add('active');

    modal.classList.add('active');
}

function updateModalQuantity(change) {
    const qtyElement = document.getElementById('modal-quantity');
    if (!qtyElement) return;
    let qty = parseInt(qtyElement.textContent);
    qty = Math.max(1, qty + change);
    qtyElement.textContent = qty;
}

// ==========================================
// CART MANAGEMENT
// ==========================================

async function loadCart() {
    if (!currentUser) {
        cart = JSON.parse(localStorage.getItem('cart')) || [];
        updateCartUI();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('cart_items')
            .select('*, products(*)')
            .eq('user_id', currentUser.id);

        if (error) throw error;

        cart = data.map(item => ({
            id: item.id,
            product: item.products,
            quantity: item.quantity,
            size: item.size
        }));

        updateCartUI();
    } catch (error) {
        console.error('Error loading cart:', error);
    }
}

async function addToCartFromModal(productId) {
    const product = products.find(p => p.id === productId);
    const selectedSize = document.querySelector('.size-option.active');
    const quantity = parseInt(document.getElementById('modal-quantity')?.textContent || '1');

    if (!selectedSize) {
        showToast('Please select a size', 'error');
        return;
    }

    await addToCart(product, selectedSize.dataset.size, quantity);
    closeModal('product-modal');
}

async function addToCart(product, size, quantity = 1) {
    if (currentUser) {
        try {
            const existingItem = cart.find(item => 
                item.product.id === product.id && item.size === size
            );

            if (existingItem) {
                const { error } = await supabase
                    .from('cart_items')
                    .update({ quantity: existingItem.quantity + quantity })
                    .eq('id', existingItem.id);

                if (error) throw error;
                existingItem.quantity += quantity;
            } else {
                const { data, error } = await supabase
                    .from('cart_items')
                    .insert({
                        user_id: currentUser.id,
                        product_id: product.id,
                        quantity: quantity,
                        size: size
                    })
                    .select('*, products(*)');

                if (error) throw error;

                cart.push({
                    id: data[0].id,
                    product: data[0].products,
                    quantity: data[0].quantity,
                    size: data[0].size
                });
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            showToast('Error adding to cart', 'error');
            return;
        }
    } else {
        const existingItem = cart.find(item => 
            item.product.id === product.id && item.size === size
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({ product, quantity, size });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    updateCartUI();
    showToast(`${product.name} added to cart!`);
}

async function removeFromCart(index) {
    if (currentUser && cart[index].id) {
        try {
            const { error } = await supabase
                .from('cart_items')
                .delete()
                .eq('id', cart[index].id);

            if (error) throw error;
        } catch (error) {
            console.error('Error removing from cart:', error);
            showToast('Error removing item', 'error');
            return;
        }
    }

    cart.splice(index, 1);
    
    if (!currentUser) {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    updateCartUI();
}

async function updateCartQuantity(index, newQuantity) {
    if (newQuantity < 1) {
        await removeFromCart(index);
        return;
    }

    if (currentUser && cart[index].id) {
        try {
            const { error } = await supabase
                .from('cart_items')
                .update({ quantity: newQuantity })
                .eq('id', cart[index].id);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating quantity:', error);
            showToast('Error updating quantity', 'error');
            return;
        }
    }

    cart[index].quantity = newQuantity;
    
    if (!currentUser) {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    updateCartUI();
}

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartItemsCount = document.getElementById('cart-items-count');
    const cartTotalAmount = document.getElementById('cart-total-amount');

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (cartCount) cartCount.textContent = totalItems;
    if (cartItemsCount) cartItemsCount.textContent = `${totalItems} items`;

    if (cart.length === 0) {
        if (cartItemsContainer) {
            cartItemsContainer.innerHTML = `
                <div class="empty-cart-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    <p>Your cart is empty</p>
                </div>
            `;
        }
        if (cartTotalAmount) cartTotalAmount.textContent = '$0.00';
        return;
    }

    if (cartItemsContainer) {
        cartItemsContainer.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <img src="${item.product.image_url}" alt="${item.product.name}">
                <div class="cart-item-details">
                    <h4>${item.product.name}</h4>
                    <p>Size: ${item.size}</p>
                    <p class="cart-item-price">${formatPrice(item.product.price)}</p>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-controls">
                        <button onclick="updateCartQuantity(${index}, ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="updateCartQuantity(${index}, ${item.quantity + 1})">+</button>
                    </div>
                    <button class="remove-btn" onclick="removeFromCart(${index})">Remove</button>
                </div>
            </div>
        `).join('');
    }

    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    if (cartTotalAmount) cartTotalAmount.textContent = formatPrice(total);
}

async function processCheckout() {
    if (cart.length === 0) {
        showToast('Your cart is empty', 'error');
        return;
    }

    if (!currentUser) {
        showToast('Please login to checkout', 'error');
        document.getElementById('auth-modal')?.classList.add('active');
        return;
    }

    try {
        const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        
        const orderData = {
            user_id: currentUser.id,
            items: cart.map(item => ({
                product_id: item.product.id,
                name: item.product.name,
                quantity: item.quantity,
                size: item.size,
                price: item.product.price,
                image_url: item.product.image_url
            })),
            total: total,
            status: 'pending'
        };

        const { data, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select();

        if (error) throw error;

        if (currentUser) {
            await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', currentUser.id);
        }

        cart = [];
        localStorage.removeItem('cart');
        updateCartUI();
        closeModal('cart-modal');
        
        const orderId = data[0].id;
        window.location.href = `payment-demo.html?amount=${total.toFixed(2)}&order_id=${orderId}`;
        
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Error processing order: ' + error.message, 'error');
    }
}

// ==========================================
// ADMIN PANEL - FIXED
// ==========================================

async function loadAdminDashboard() {
    console.log('Loading admin dashboard...');
    
    const dashboard = document.getElementById('admin-dashboard');
    if (!dashboard) return;
    
    dashboard.style.display = 'block';
    dashboard.classList.add('active');
    
    // Hide all sections first
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show products section by default
    const productsSection = document.getElementById('products-section');
    if (productsSection) {
        productsSection.style.display = 'block';
        productsSection.classList.add('active');
    }
    
    // Load data
    try {
        await Promise.all([
            loadAdminProducts(),
            loadAdminOrders(),
            loadAdminInventory()
        ]);
        console.log('Admin dashboard loaded successfully');
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showToast('Error loading admin data. Please refresh.', 'error');
    }
}

function showAdminSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }
}

async function loadAdminProducts() {
    try {
        const tbody = document.getElementById('admin-products-body');
        if (!tbody) return;
        
        if (!allProducts || allProducts.length === 0) {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            allProducts = data || [];
        }
        
        if (allProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No products found. Add your first product!</td></tr>';
            return;
        }
        
        tbody.innerHTML = allProducts.map(product => {
            const stockStatus = product.stock === 0 ? 'out-of-stock' : (product.stock < 10 ? 'low-stock' : 'in-stock');
            const stockLabel = product.stock === 0 ? 'Out of Stock' : (product.stock < 10 ? 'Low Stock' : 'In Stock');
            
            return `
                <tr>
                    <td><img src="${product.image_url}" alt="${product.name}" style="width: 50px; height: 60px; object-fit: cover; border-radius: 4px;"></td>
                    <td>${product.name}</td>
                    <td>${product.category}</td>
                    <td>${formatPrice(product.price)}</td>
                    <td>${product.stock}</td>
                    <td><span class="status-badge ${stockStatus}">${stockLabel}</span></td>
                    <td>
                        <button class="action-btn" onclick="editProduct('${product.id}')">Edit</button>
                        <button class="action-btn danger" onclick="deleteProduct('${product.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading admin products:', error);
        const tbody = document.getElementById('admin-products-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: red;">Error: ${error.message}</td></tr>`;
        }
    }
}

async function loadAdminOrders() {
    try {
        const tbody = document.getElementById('admin-orders-body');
        if (!tbody) return;
        
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        orders = data || [];
        
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No orders yet</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>#${order.id.slice(0, 8)}</td>
                <td>${order.user_id ? order.user_id.slice(0, 8) + '...' : 'Guest'}</td>
                <td>${new Date(order.created_at).toLocaleDateString()}</td>
                <td>${formatPrice(order.total)}</td>
                <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                <td>
                    <button class="action-btn" onclick="viewAdminOrder('${order.id}')">View</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading orders:', error);
        const tbody = document.getElementById('admin-orders-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: red;">Error: ${error.message}</td></tr>`;
        }
    }
}

async function loadAdminInventory() {
    const tbody = document.getElementById('inventory-body');
    const alerts = document.getElementById('low-stock-alerts');
    
    if (!tbody || !alerts) return;

    try {
        if (!allProducts || allProducts.length === 0) {
            await loadAdminProducts();
        }

        const lowStockProducts = allProducts.filter(p => p.stock < 10);

        alerts.innerHTML = lowStockProducts.length > 0
            ? lowStockProducts.map(p => `
                <div class="alert-item">
                    <strong>${p.name}</strong> - Only ${p.stock} left in stock
                </div>
            `).join('')
            : '<p style="color: #666;">No low stock alerts</p>';

        tbody.innerHTML = allProducts.map(product => `
            <tr>
                <td>${product.name}</td>
                <td>${product.sku}</td>
                <td>${product.stock}</td>
                <td>10</td>
                <td>
                    <button class="action-btn" onclick="updateStockPrompt('${product.id}', '${product.name}', ${product.stock})">Update Stock</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading inventory:', error);
    }
}

async function saveAdminProduct(productData) {
    try {
        if (productData.id) {
            const { error } = await supabase
                .from('products')
                .update(productData)
                .eq('id', productData.id);

            if (error) throw error;
            showToast('Product updated successfully!');
        } else {
            const { error } = await supabase
                .from('products')
                .insert(productData);

            if (error) throw error;
            showToast('Product created successfully!');
        }

        await loadProducts();
        await loadAdminProducts();
        closeModal('product-form-modal');
    } catch (error) {
        console.error('Error saving product:', error);
        showToast('Error saving product: ' + error.message, 'error');
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

        showToast('Product deleted successfully!');
        await loadProducts();
        await loadAdminProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Error deleting product', 'error');
    }
}

function editProduct(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('form-title').textContent = 'Edit Product';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-category').value = product.category;
    document.getElementById('product-image').value = product.image_url || '';
    document.getElementById('product-sizes').value = product.sizes ? product.sizes.join(', ') : '';
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('product-sku').value = product.sku;

    resetImageUpload();
    
    document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-upload-type="url"]')?.classList.add('active');
    document.getElementById('file-upload-section').style.display = 'none';
    document.getElementById('url-upload-section').style.display = 'block';
    document.getElementById('product-image-url').value = product.image_url || '';

    document.getElementById('product-form-modal')?.classList.add('active');
}

function viewAdminOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const items = order.items || [];
    const itemsList = items.map(i => `- ${i.name} (${i.size}) x${i.quantity} @ $${i.price}`).join('\n');
    
    alert(`Order #${order.id.slice(0, 8)}\nStatus: ${order.status}\nTotal: ${formatPrice(order.total)}\nDate: ${new Date(order.created_at).toLocaleString()}\n\nItems:\n${itemsList}`);
}

function updateStockPrompt(productId, productName, currentStock) {
    const newStock = prompt(`Update stock for "${productName}"\nCurrent stock: ${currentStock}\n\nEnter new stock quantity:`);
    if (newStock !== null && !isNaN(newStock) && newStock !== '') {
        const stockNum = parseInt(newStock);
        if (stockNum >= 0) {
            saveAdminProduct({ id: productId, stock: stockNum });
        } else {
            showToast('Stock must be 0 or greater', 'error');
        }
    }
}

// ==========================================
// UI EVENT HANDLERS
// ==========================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function openCartSidebar() {
    const cartModal = document.getElementById('cart-modal');
    if (cartModal) {
        cartModal.classList.add('active');
    }
}

function closeCartSidebar() {
    closeModal('cart-modal');
}

function switchPage(pageName) {
    document.querySelectorAll('.page-section, #shop-page').forEach(page => {
        page.style.display = 'none';
    });

    if (pageName === 'shop') {
        document.getElementById('shop-page').style.display = 'block';
        document.querySelector('.filters-section').style.display = 'block';
        document.querySelector('.products-section').style.display = 'block';
    } else {
        const pageEl = document.getElementById(`${pageName}-page`);
        if (pageEl) pageEl.style.display = 'block';
        document.querySelector('.filters-section').style.display = 'none';
        document.querySelector('.products-section').style.display = 'none';
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageName) {
            link.classList.add('active');
        }
    });
}

// ==========================================
// IMAGE UPLOAD FUNCTIONALITY
// ==========================================

let selectedImageFile = null;
let uploadedImageUrl = null;

function initializeImageUpload() {
    const uploadTabs = document.querySelectorAll('.upload-tab');
    const fileUploadSection = document.getElementById('file-upload-section');
    const urlUploadSection = document.getElementById('url-upload-section');
    const fileUploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('product-image-file');
    const urlInput = document.getElementById('product-image-url');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    if (!uploadTabs.length) return;
    
    uploadTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            uploadTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const uploadType = tab.dataset.uploadType;
            if (uploadType === 'file') {
                fileUploadSection.style.display = 'block';
                urlUploadSection.style.display = 'none';
            } else {
                fileUploadSection.style.display = 'none';
                urlUploadSection.style.display = 'block';
            }
        });
    });
    
    if (fileUploadArea) {
        fileUploadArea.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-image-btn')) {
                fileInput?.click();
            }
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (!file.type.startsWith('image/')) {
                    showToast('Please select an image file', 'error');
                    return;
                }
                
                if (file.size > 5 * 1024 * 1024) {
                    showToast('Image must be less than 5MB', 'error');
                    return;
                }
                
                selectedImageFile = file;
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewImage = document.getElementById('preview-image');
                    const uploadPlaceholder = document.querySelector('.upload-placeholder');
                    const uploadPreview = document.getElementById('upload-preview');
                    
                    if (previewImage && uploadPreview && uploadPlaceholder) {
                        previewImage.src = e.target.result;
                        uploadPlaceholder.style.display = 'none';
                        uploadPreview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetImageUpload();
        });
    }
    
    if (urlInput) {
        urlInput.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if (url) {
                document.getElementById('product-image').value = url;
                uploadedImageUrl = url;
            }
        });
    }
    
    if (fileUploadArea) {
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('dragover');
        });
        
        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('dragover');
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });
    }
}

async function uploadImageToSupabase(file) {
    try {
        const progressSection = document.getElementById('upload-progress');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        const fileExt = file.name.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90 && progressFill && progressText) {
                progressFill.style.width = progress + '%';
                progressText.textContent = `Uploading... ${progress}%`;
            }
        }, 100);
        
        const { data, error } = await supabase.storage
            .from('threadline-products')
            .upload(filename, file, {
                cacheControl: '3600',
                upsert: false
            });
        
        clearInterval(progressInterval);
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
            .from('threadline-products')
            .getPublicUrl(filename);
        
        if (progressFill && progressText) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Upload complete!';
        }
        
        setTimeout(() => {
            if (progressSection) {
                progressSection.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }
        }, 1000);
        
        return publicUrl;
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload image: ' + error.message, 'error');
        return null;
    }
}

function resetImageUpload() {
    selectedImageFile = null;
    uploadedImageUrl = null;
    
    const fileInput = document.getElementById('product-image-file');
    const hiddenImageInput = document.getElementById('product-image');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    const uploadPreview = document.getElementById('upload-preview');
    const urlInput = document.getElementById('product-image-url');
    
    if (fileInput) fileInput.value = '';
    if (hiddenImageInput) hiddenImageInput.value = '';
    if (urlInput) urlInput.value = '';
    if (uploadPlaceholder) uploadPlaceholder.style.display = 'block';
    if (uploadPreview) uploadPreview.style.display = 'none';
}

// ==========================================
// SEARCH FUNCTIONALITY - FIXED FOR HEADER OFFSET
// ==========================================

function openSearchModal() {
    const filtersSection = document.querySelector('.filters-section');
    
    if (filtersSection) {
        const headerOffset = 100;
        const elementPosition = filtersSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: "smooth"
        });
        
        setTimeout(() => {
            document.getElementById('search-input')?.focus();
        }, 500);
    }
}

// ==========================================
// HERO ROTATOR
// ==========================================

function initHeroRotator() {
    const words = document.querySelectorAll('.rotating-word');
    const products = document.querySelectorAll('.floating-product');
    
    if (words.length > 0) {
        let currentIndex = 0;
        setInterval(() => {
            words.forEach((word, i) => {
                word.classList.toggle('active', i === currentIndex);
            });
            currentIndex = (currentIndex + 1) % words.length;
        }, 3000);
    }
    
    if (products.length > 0) {
        let currentProd = 0;
        // Initial state
        products.forEach((prod, i) => {
            setTimeout(() => {
                prod.classList.add('active');
            }, i * 200);
        });
        
        // Cycle through highlighting
        setInterval(() => {
            products.forEach((prod, i) => {
                if (i === currentProd) {
                    prod.style.zIndex = '10';
                    prod.style.transform = prod.style.transform + ' scale(1.05)';
                } else {
                    prod.style.zIndex = '1';
                    prod.style.transform = prod.style.transform.replace(' scale(1.05)', '');
                }
            });
            currentProd = (currentProd + 1) % products.length;
        }, 4000);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen')?.classList.add('hidden');
    }, 1500);

    // Initialize database and load products
    await initializeDatabase();
    await checkAuth();
    await loadProducts();
    
    // Initialize image upload
    initializeImageUpload();
    
    // Initialize hero rotator
    initHeroRotator();

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks) navLinks.classList.remove('active');
        });
    });

    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchPage(link.dataset.page);
        });
    });

    // Search button
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', openSearchModal);
    }

    // Cart button
    document.getElementById('cart-btn')?.addEventListener('click', openCartSidebar);
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            const modal = closeBtn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Click overlay to close modals
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            const modal = overlay.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Account button
    document.getElementById('account-btn')?.addEventListener('click', () => {
        if (currentUser) {
            if (confirm('Do you want to logout?')) {
                handleLogout();
            }
        } else {
            document.getElementById('auth-modal')?.classList.add('active');
        }
    });

    // Admin button - FIXED
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const adminDashboard = document.getElementById('admin-dashboard');
            if (adminDashboard) {
                if (adminDashboard.style.display === 'block') {
                    adminDashboard.style.display = 'none';
                    adminDashboard.classList.remove('active');
                    document.body.style.overflow = '';
                } else {
                    adminDashboard.style.display = 'block';
                    document.body.style.overflow = 'hidden';
                    loadAdminDashboard();
                }
            }
        });
    }

    const closeAdminBtn = document.getElementById('close-admin');
    if (closeAdminBtn) {
        closeAdminBtn.addEventListener('click', () => {
            const adminDashboard = document.getElementById('admin-dashboard');
            if (adminDashboard) {
                adminDashboard.style.display = 'none';
                adminDashboard.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Add product button
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => {
            const formTitle = document.getElementById('form-title');
            const productForm = document.getElementById('product-form');
            const productId = document.getElementById('product-id');
            
            if (formTitle) formTitle.textContent = 'Add New Product';
            if (productForm) productForm.reset();
            if (productId) productId.value = '';
            
            document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-upload-type="file"]')?.classList.add('active');
            document.getElementById('file-upload-section').style.display = 'block';
            document.getElementById('url-upload-section').style.display = 'none';
            resetImageUpload();
            document.getElementById('product-form-modal')?.classList.add('active');
        });
    }

    // Product form submission
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            let imageUrl = document.getElementById('product-image').value;
            
            if (selectedImageFile) {
                showToast('Uploading image...', 'info');
                imageUrl = await uploadImageToSupabase(selectedImageFile);
                
                if (!imageUrl) {
                    showToast('Failed to upload image. Please try again.', 'error');
                    return;
                }
            }
            
            if (!imageUrl) {
                showToast('Please provide an image (upload or URL)', 'error');
                return;
            }
            
            const productData = {
                name: document.getElementById('product-name').value,
                description: document.getElementById('product-description').value,
                price: parseFloat(document.getElementById('product-price').value),
                category: document.getElementById('product-category').value,
                image_url: imageUrl,
                sizes: document.getElementById('product-sizes').value.split(',').map(s => s.trim()).filter(s => s),
                stock: parseInt(document.getElementById('product-stock').value),
                sku: document.getElementById('product-sku').value
            };

            const productId = document.getElementById('product-id').value;
            if (productId) {
                productData.id = productId;
            }

            await saveAdminProduct(productData);
            resetImageUpload();
        });
    }

    const formCancel = document.getElementById('form-cancel');
    if (formCancel) {
        formCancel.addEventListener('click', () => {
            closeModal('product-form-modal');
        });
    }

    const productFormClose = document.getElementById('product-form-close');
    if (productFormClose) {
        productFormClose.addEventListener('click', () => {
            closeModal('product-form-modal');
        });
    }

    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => {
                f.style.display = 'none';
            });
            
            tab.classList.add('active');
            const formId = `${tab.dataset.tab}-form`;
            const form = document.getElementById(formId);
            if (form) {
                form.style.display = 'flex';
            }
        });
    });

    // Auth forms
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = e.target.querySelector('input[type="email"]').value;
            const password = e.target.querySelector('input[type="password"]').value;
            handleLogin(email, password);
        });
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = e.target.querySelector('input[type="text"]').value;
            const email = e.target.querySelector('input[type="email"]').value;
            const password = e.target.querySelector('input[type="password"]').value;
            handleSignup(name, email, password);
        });
    }

    // Checkout button
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', processCheckout);
    }

    // Search and filters
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const sizeFilter = document.getElementById('size-filter');
    const sortFilter = document.getElementById('sort-filter');

    const applyFilters = debounce(() => {
        loadProducts({
            search: searchInput ? searchInput.value : '',
            category: categoryFilter ? categoryFilter.value : '',
            size: sizeFilter ? sizeFilter.value : '',
            sort: sortFilter ? sortFilter.value : ''
        });
    }, 300);

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (sizeFilter) sizeFilter.addEventListener('change', applyFilters);
    if (sortFilter) sortFilter.addEventListener('change', applyFilters);

    // Contact form
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Message sent! We\'ll get back to you soon.');
            e.target.reset();
        });
    }
});

// Make functions globally accessible
window.openProductModal = openProductModal;
window.updateModalQuantity = updateModalQuantity;
window.addToCartFromModal = addToCartFromModal;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.viewAdminOrder = viewAdminOrder;
window.updateStockPrompt = updateStockPrompt;
window.showToast = showToast;
window.formatPrice = formatPrice;

// Expose Supabase client globally for analytics module
window.threadlineSupabase = supabase;

})();