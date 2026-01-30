// ==========================================
// ANALYTICS & TRACKING MODULE
// ==========================================

// Initialize Supabase client for this module if not already available
let supabaseClient;

function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    
    // Try to get from window (if app.js exposed it)
    if (window.threadlineSupabase) {
        supabaseClient = window.threadlineSupabase;
        return supabaseClient;
    }
    
    // Create our own instance
    const SUPABASE_URL = window.SUPABASE_CONFIG?.url;
    const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey;
    
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseClient;
    }
    
    return null;
}

// ==========================================
// ANALYTICS DATA COLLECTION
// ==========================================

async function loadDashboardAnalytics() {
    const supabase = getSupabaseClient();
    if (!supabase) {
        console.warn('Supabase not available for analytics');
        return;
    }
    
    try {
        // Load all analytics data in parallel
        const [revenueData, ordersData, productsData, customersData, categoryData, recentOrders] = await Promise.all([
            calculateRevenue(),
            getOrdersStats(),
            getProductsStats(),
            getCustomersCount(),
            getCategoryBreakdown(),
            getRecentOrders(5)
        ]);

        // Update stat cards
        updateStatCard('total-revenue', formatPrice(revenueData.total), `${revenueData.change >= 0 ? '+' : ''}${revenueData.change}% from last month`, revenueData.change >= 0);
        updateStatCard('total-orders', ordersData.total, `${ordersData.thisMonth} this month`);
        updateStatCard('total-products', productsData.total, `${productsData.lowStock} low stock`);
        updateStatCard('total-customers', customersData.total, `${customersData.newThisMonth} new this month`);

        // Update charts
        await updateRevenueChart(30); // Last 30 days by default
        await updateCategoryChart(categoryData);

        // Update recent orders table
        displayRecentOrders(recentOrders);

    } catch (error) {
        console.error('Error loading dashboard analytics:', error);
        showToast('Failed to load analytics', 'error');
    }
}

function updateStatCard(valueId, value, change, isPositive = null) {
    const valueEl = document.getElementById(valueId);
    const changeEl = document.getElementById(valueId.replace('total-', '') + '-change');
    
    if (valueEl) valueEl.textContent = value;
    if (changeEl) {
        changeEl.textContent = change;
        if (isPositive !== null) {
            changeEl.className = `stat-change ${isPositive ? 'positive' : 'negative'}`;
        }
    }
}

// ==========================================
// REVENUE CALCULATIONS
// ==========================================

async function calculateRevenue() {
    const supabase = getSupabaseClient();
    if (!supabase) return { total: 0, lastMonth: 0, change: 0 };
    
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Current month revenue
        const { data: currentMonth, error: currentError } = await supabase
            .from('orders')
            .select('total')
            .eq('payment_status', 'paid')
            .gte('created_at', startOfMonth.toISOString());

        if (currentError) throw currentError;

        // Last month revenue
        const { data: lastMonth, error: lastError } = await supabase
            .from('orders')
            .select('total')
            .eq('payment_status', 'paid')
            .gte('created_at', startOfLastMonth.toISOString())
            .lte('created_at', endOfLastMonth.toISOString());

        if (lastError) throw lastError;

        const currentRevenue = currentMonth?.reduce((sum, order) => sum + parseFloat(order.total), 0) || 0;
        const lastRevenue = lastMonth?.reduce((sum, order) => sum + parseFloat(order.total), 0) || 0;

        const change = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : 0;

        return {
            total: currentRevenue,
            lastMonth: lastRevenue,
            change: parseFloat(change)
        };
    } catch (error) {
        console.error('Error calculating revenue:', error);
        return { total: 0, lastMonth: 0, change: 0 };
    }
}

async function getRevenueByPeriod(days = 30) {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('orders')
            .select('created_at, total')
            .eq('payment_status', 'paid')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Group by date
        const revenueByDate = {};
        data?.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString();
            revenueByDate[date] = (revenueByDate[date] || 0) + parseFloat(order.total);
        });

        return Object.entries(revenueByDate).map(([date, revenue]) => ({ date, revenue }));
    } catch (error) {
        console.error('Error getting revenue by period:', error);
        return [];
    }
}

// ==========================================
// ORDERS STATISTICS
// ==========================================

async function getOrdersStats() {
    const supabase = getSupabaseClient();
    if (!supabase) return { total: 0, thisMonth: 0 };
    
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Total orders
        const { count: totalCount, error: totalError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        // This month's orders
        const { count: monthCount, error: monthError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfMonth.toISOString());

        if (totalError || monthError) throw totalError || monthError;

        return {
            total: totalCount || 0,
            thisMonth: monthCount || 0
        };
    } catch (error) {
        console.error('Error getting orders stats:', error);
        return { total: 0, thisMonth: 0 };
    }
}

async function getRecentOrders(limit = 5) {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting recent orders:', error);
        return [];
    }
}

function displayRecentOrders(orders) {
    const tbody = document.querySelector('#dashboard-page .data-table tbody');
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No recent orders</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>#${order.id.substring(0, 8)}</td>
            <td>${order.customer_email || 'Guest'}</td>
            <td>${formatPrice(order.total)}</td>
            <td><span class="status-badge status-${order.payment_status}">${order.payment_status}</span></td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// ==========================================
// PRODUCTS STATISTICS
// ==========================================

async function getProductsStats() {
    const supabase = getSupabaseClient();
    if (!supabase) return { total: 0, lowStock: 0 };
    
    try {
        const { data, error } = await supabase
            .from('products')
            .select('stock');

        if (error) throw error;

        const total = data?.length || 0;
        const lowStock = data?.filter(p => p.stock < 10).length || 0;

        return { total, lowStock };
    } catch (error) {
        console.error('Error getting products stats:', error);
        return { total: 0, lowStock: 0 };
    }
}

async function getTopProducts(limit = 5) {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    try {
        const { data, error } = await supabase
            .from('products')
            .select('id, name, sales_count, price, image_url')
            .order('sales_count', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting top products:', error);
        return [];
    }
}

// ==========================================
// CUSTOMER STATISTICS
// ==========================================

async function getCustomersCount() {
    const supabase = getSupabaseClient();
    if (!supabase) return { total: 0, newThisMonth: 0 };
    
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // This is a workaround - in production, you'd query auth.users
        // For now, count unique customer emails from orders
        const { data, error } = await supabase
            .from('orders')
            .select('customer_email, created_at');

        if (error) throw error;

        const uniqueCustomers = new Set(data?.map(o => o.customer_email).filter(Boolean));
        const newThisMonth = data?.filter(o => new Date(o.created_at) >= startOfMonth)
            .map(o => o.customer_email)
            .filter((email, index, self) => email && self.indexOf(email) === index).length || 0;

        return {
            total: uniqueCustomers.size,
            newThisMonth
        };
    } catch (error) {
        console.error('Error getting customers count:', error);
        return { total: 0, newThisMonth: 0 };
    }
}

// ==========================================
// CATEGORY BREAKDOWN
// ==========================================

async function getCategoryBreakdown() {
    const supabase = getSupabaseClient();
    if (!supabase) return {};
    
    try {
        const { data, error } = await supabase
            .from('products')
            .select('category, sales_count');

        if (error) throw error;

        const breakdown = {};
        data?.forEach(product => {
            const category = product.category || 'Uncategorized';
            breakdown[category] = (breakdown[category] || 0) + (product.sales_count || 0);
        });

        return breakdown;
    } catch (error) {
        console.error('Error getting category breakdown:', error);
        return {};
    }
}

// ==========================================
// CHART UPDATES
// ==========================================

async function updateRevenueChart(days = 30) {
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;

    const revenueData = await getRevenueByPeriod(days);

    // Destroy existing chart if it exists
    if (window.revenueChart) {
        window.revenueChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    window.revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: revenueData.map(d => d.date),
            datasets: [{
                label: 'Revenue',
                data: revenueData.map(d => d.revenue),
                borderColor: '#c9a05f',
                backgroundColor: 'rgba(201, 160, 95, 0.1)',
                tension: 0.4,
                fill: true,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Revenue: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

async function updateCategoryChart(categoryData) {
    const canvas = document.getElementById('category-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (window.categoryChart) {
        window.categoryChart.destroy();
    }

    const categories = Object.keys(categoryData);
    const sales = Object.values(categoryData);

    const colors = [
        '#c9a05f',
        '#1a1a1a',
        '#2d7a4f',
        '#d64545',
        '#667eea'
    ];

    const ctx = canvas.getContext('2d');
    window.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: sales,
                backgroundColor: colors.slice(0, categories.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// ==========================================
// INVENTORY AUTOMATION
// ==========================================

async function checkInventoryAlerts() {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    
    try {
        const { data, error } = await supabase
            .from('inventory_alerts')
            .select(`
                *,
                products (
                    id,
                    name,
                    stock,
                    sku
                )
            `)
            .eq('is_active', true)
            .eq('notification_sent', false);

        if (error) throw error;

        if (data && data.length > 0) {
            // Show alerts to admin
            data.forEach(alert => {
                const message = alert.alert_type === 'out_of_stock' 
                    ? `${alert.products.name} is out of stock!`
                    : `${alert.products.name} is low on stock (${alert.products.stock} left)`;
                
                showToast(message, 'warning');
            });

            // Mark as notified
            const alertIds = data.map(a => a.id);
            await supabase
                .from('inventory_alerts')
                .update({ notification_sent: true })
                .in('id', alertIds);
        }

        return data || [];
    } catch (error) {
        console.error('Error checking inventory alerts:', error);
        return [];
    }
}

async function updateInventoryAlert(productId, alertType, isActive) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    
    try {
        const { error } = await supabase
            .from('inventory_alerts')
            .upsert({
                product_id: productId,
                alert_type: alertType,
                is_active: isActive,
                last_triggered: new Date().toISOString()
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error updating inventory alert:', error);
    }
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

async function exportOrdersCSV() {
    const supabase = getSupabaseClient();
    if (!supabase) {
        showToast('Database connection not available', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Convert to CSV
        const headers = ['Order ID', 'Customer Email', 'Total', 'Payment Status', 'Shipping Status', 'Date'];
        const rows = data.map(order => [
            order.id,
            order.customer_email || 'Guest',
            order.total,
            order.payment_status,
            order.shipping_status || 'N/A',
            new Date(order.created_at).toLocaleDateString()
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download file
        downloadCSV(csv, 'orders_export.csv');
        showToast('Orders exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting orders:', error);
        showToast('Failed to export orders', 'error');
    }
}

async function exportProductsCSV() {
    const supabase = getSupabaseClient();
    if (!supabase) {
        showToast('Database connection not available', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('name');

        if (error) throw error;

        const headers = ['SKU', 'Name', 'Category', 'Price', 'Stock', 'Sales Count', 'Views'];
        const rows = data.map(product => [
            product.sku,
            product.name,
            product.category,
            product.price,
            product.stock,
            product.sales_count || 0,
            product.views || 0
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        downloadCSV(csv, 'products_export.csv');
        showToast('Products exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting products:', error);
        showToast('Failed to export products', 'error');
    }
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ==========================================
// EVENT TRACKING (for front-end analytics)
// ==========================================

async function trackEvent(eventType, metadata = {}) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.warn('Cannot track event: Supabase not initialized');
            return;
        }
        
        const { error } = await supabase
            .from('analytics_events')
            .insert({
                event_type: eventType,
                user_id: window.currentUser?.id || null,
                product_id: metadata.product_id || null,
                session_id: getSessionId(),
                metadata: metadata
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error tracking event:', error);
    }
}

function getSessionId() {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(7);
        sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
}

// Track product view
async function trackProductView(productId) {
    await trackEvent('product_view', { product_id: productId });
    
    // Increment product views in database
    const supabase = getSupabaseClient();
    if (!supabase) return;
    
    try {
        const { error } = await supabase.rpc('increment_product_views', {
            product_uuid: productId
        });
        if (error) console.error('Error incrementing views:', error);
    } catch (error) {
        console.error('Error tracking product view:', error);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

// Add event listener for revenue period selector
document.addEventListener('DOMContentLoaded', () => {
    const periodSelector = document.getElementById('revenue-period');
    if (periodSelector) {
        periodSelector.addEventListener('change', (e) => {
            updateRevenueChart(parseInt(e.target.value));
        });
    }
});

// Helper function for price formatting (if not already defined)
function formatPrice(price) {
    return '$' + parseFloat(price).toFixed(2);
}

// Helper function for toast notifications (if not already defined)
function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(message, type);
        return;
    }
    
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